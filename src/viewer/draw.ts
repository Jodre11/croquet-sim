/**
 * The viewer's drawing (side-on viewer spec §3.4, decisions 1, 5, 6 and 7): Canvas 2D in the aim's vertical plane, as
 * the prototype drew it, its colours from the page's CSS variables.
 */
import type { Departure, Frame, FramedPlay, SidePoint } from "../lab/frames";
import type { PathSample } from "./plannedPath";

/** The page's colours (CSS variables, spec §3.4). */
export interface Colours {
    readonly ink: string;
    readonly muted: string;
    readonly turf: string;
    readonly striker: string;
    readonly croqueted: string;
    readonly planned: string;
    readonly played: string;
    readonly flag: string;
    readonly background: string;
}

/** The colours from `element`'s CSS variables. */
export function coloursOf(element: Element): Colours {
    const style = getComputedStyle(element);
    const v = (name: string): string => style.getPropertyValue(`--${name}`).trim() || "#000";
    return {
        ink: v("ink"),
        muted: v("muted"),
        turf: v("turf"),
        striker: v("striker"),
        croqueted: v("croqueted"),
        planned: v("planned"),
        played: v("played"),
        flag: v("flag"),
        background: v("surface"),
    };
}

/** The canvas sized to its box at the device's pixel ratio; its context scaled to CSS pixels. */
export function fitCanvas(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; width: number; height: number } {
    const ratio = window.devicePixelRatio || 1;
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx, width, height };
}

/** The frame (or path sample) at play time `t` (s): the last at or before it, else the first. */
export function frameAt<F extends { readonly t: number }>(frames: readonly F[], t: number): F | null {
    let lo = 0;
    let hi = frames.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if ((frames[mid] as F).t <= t) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    return frames[Math.max(0, lo - 1)] ?? null;
}

/** What the side-on canvas shows. */
export interface SideView {
    /** The planned path (dotted), null where planning rejected the set-up. */
    readonly path: readonly PathSample[] | null;
    /** The Run's play, and the play time (s) shown; null before a Run. */
    readonly framed: FramedPlay | null;
    readonly t: number;
    /** The balls in their set-up, striker's first, and their radius (m). */
    readonly balls: readonly SidePoint[];
    readonly radius: number;
    /** The head's length and half-height, and the shaft's length from the socket (m). */
    readonly head: { readonly length: number; readonly halfHeight: number; readonly shaft: number };
    /** The feet's reading (m along aim from the striker's ball's centre): the hands' arc's lowest point. */
    readonly feet: number;
}

/** The plumb line from the top hand `top` (design §5.5): its x, and its distance ahead of the ball's centre `ball`. */
export function plumbOf(top: SidePoint, ball: SidePoint): { readonly x: number; readonly ahead: number } {
    return { x: top.x, ahead: top.x - ball.x };
}

/** A signed distance (m) shown in mm. */
const mm = (d: number): string => `${d >= 0 ? "+" : "−"}${Math.abs(d * 1000).toFixed(0)} mm`;

/** The head's face centre and the face's direction for a head at `head` pitched `pitch`. */
function faceOf(head: SidePoint & { readonly pitch: number }, length: number): SidePoint {
    return { x: head.x + (Math.cos(head.pitch) * length) / 2, z: head.z + (Math.sin(head.pitch) * length) / 2 };
}

/** The side-on scene (spec §2, §3.4; decisions 1, 5, 6). */
export function drawSideOn(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    view: SideView,
    c: Colours,
): void {
    ctx.fillStyle = c.background;
    ctx.fillRect(0, 0, width, height);
    const points: SidePoint[] = [...view.balls, { x: view.feet, z: 0 }];
    for (const s of view.path ?? []) {
        points.push(s.top, s.bottom, s.head, s.face);
    }
    for (const f of view.framed?.frames ?? []) {
        points.push(f.top, f.bottom, f.head, ...f.balls);
    }
    const xs = points.map((p) => p.x);
    const zs = points.map((p) => p.z);
    const margin = 0.06;
    const [x0, x1] = [Math.min(...xs) - margin, Math.max(...xs) + margin];
    const [z0, z1] = [Math.min(-0.03, ...zs) - margin, Math.max(...zs) + margin];
    const scale = Math.min(width / (x1 - x0), height / (z1 - z0));
    const left = (width - (x1 - x0) * scale) / 2;
    const bottom = height - (height - (z1 - z0) * scale) / 2;
    const px = (p: SidePoint): [number, number] => [left + (p.x - x0) * scale, bottom - (p.z - z0) * scale];

    // The turf line.
    ctx.strokeStyle = c.turf;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, px({ x: 0, z: 0 })[1]);
    ctx.lineTo(width, px({ x: 0, z: 0 })[1]);
    ctx.stroke();

    const line = (a: SidePoint, b: SidePoint): void => {
        ctx.beginPath();
        ctx.moveTo(...px(a));
        ctx.lineTo(...px(b));
        ctx.stroke();
    };
    const tickLength = 0.03;
    // The planned path: the top hand's, ticked with the shaft's angle, and the leading face's, ticked with the face's.
    if (view.path !== null) {
        ctx.setLineDash([3, 4]);
        ctx.strokeStyle = c.planned;
        ctx.lineWidth = 1.5;
        for (const key of ["top", "face"] as const) {
            ctx.beginPath();
            view.path.forEach((s, i) => (i === 0 ? ctx.moveTo(...px(s[key])) : ctx.lineTo(...px(s[key]))));
            ctx.stroke();
        }
        ctx.setLineDash([]);
        view.path.forEach((s, i) => {
            if (i % 8 !== 0) {
                return;
            }
            const dx = s.bottom.x - s.top.x;
            const dz = s.bottom.z - s.top.z;
            const n = Math.hypot(dx, dz) || 1;
            line(s.top, { x: s.top.x + (dx / n) * tickLength, z: s.top.z + (dz / n) * tickLength });
            const up = { x: -Math.sin(s.head.pitch), z: Math.cos(s.head.pitch) };
            line(
                { x: s.face.x - up.x * tickLength * 0.5, z: s.face.z - up.z * tickLength * 0.5 },
                { x: s.face.x + up.x * tickLength * 0.5, z: s.face.z + up.z * tickLength * 0.5 },
            );
        });
    }

    const framed = view.framed;
    const frame = framed === null ? null : frameAt(framed.frames, view.t);
    // The played path up to now: the top hand's and the face's.
    if (framed !== null && frame !== null) {
        ctx.strokeStyle = c.played;
        ctx.lineWidth = 1.5;
        const shown = framed.frames.filter((f) => f.t <= view.t);
        for (const pick of [(f: Frame) => f.top, (f: Frame) => faceOf(f.head, view.head.length)]) {
            ctx.beginPath();
            shown.forEach((f, i) => (i === 0 ? ctx.moveTo(...px(pick(f))) : ctx.lineTo(...px(pick(f)))));
            ctx.stroke();
        }
    }

    // The balls: in their set-up before a Run, else the frame's.
    const balls = frame?.balls ?? view.balls;
    balls.forEach((b, i) => {
        ctx.fillStyle = i === 0 ? c.striker : c.croqueted;
        ctx.beginPath();
        ctx.arc(...px(b), view.radius * scale, 0, 2 * Math.PI);
        ctx.fill();
    });

    // The mallet: before a Run, along the planned path at the play time (decision 1; hands-from-lean design §5.2), else
    // the frame's; both hands on the shaft.
    const pose = frame ?? (view.path === null ? null : frameAt(view.path, view.t));

    // The feet and the hands (design §5.5): a foot marker at the feet's reading, and a dotted plumb line from the top
    // hand to the lawn, each labelled with its distance ahead of the striker's ball's centre.
    // Both measured from the striker's ball at address, so the readings stay comparable after it is struck.
    const ball = view.balls[0] ?? { x: 0, z: view.radius };
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillStyle = c.planned;
    const [fx, fy] = px({ x: view.feet, z: 0 });
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(fx - 6, fy + 10);
    ctx.lineTo(fx + 6, fy + 10);
    ctx.closePath();
    ctx.fill();
    ctx.fillText(`feet ${mm(view.feet - ball.x)}`, fx + 8, fy + 14);
    if (pose !== null) {
        const plumb = plumbOf(pose.top, ball);
        ctx.strokeStyle = c.planned;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        line(pose.top, { x: plumb.x, z: 0 });
        ctx.setLineDash([]);
        const [hx, hy] = px(pose.top);
        ctx.fillText(`hands ${mm(plumb.ahead)}`, hx + 10, hy + 4);
    }

    if (pose !== null) {
        const { head } = pose;
        const along = { x: Math.cos(head.pitch), z: Math.sin(head.pitch) };
        const up = { x: -along.z, z: along.x };
        const { length, halfHeight } = view.head;
        const corner = (a: number, b: number): [number, number] =>
            px({
                x: head.x + along.x * a * (length / 2) + up.x * b * halfHeight,
                z: head.z + along.z * a * (length / 2) + up.z * b * halfHeight,
            });
        ctx.fillStyle = c.ink;
        ctx.beginPath();
        ctx.moveTo(...corner(-1, -1));
        ctx.lineTo(...corner(1, -1));
        ctx.lineTo(...corner(1, 1));
        ctx.lineTo(...corner(-1, 1));
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = c.ink;
        ctx.lineWidth = 3;
        // The whole shaft, to its end, so hands low on it read as low.
        const toTop = { x: pose.top.x - head.x, z: pose.top.z - head.z };
        const reach = Math.hypot(toTop.x, toTop.z);
        const end = halfHeight + view.head.shaft;
        line(head, reach > 0 ? { x: head.x + (toTop.x / reach) * end, z: head.z + (toTop.z / reach) * end } : pose.top);
        for (const hand of [pose.top, pose.bottom]) {
            ctx.fillStyle = c.played;
            ctx.beginPath();
            ctx.arc(...px(hand), 5, 0, 2 * Math.PI);
            ctx.fill();
        }
    }

    // The flags where they occur, and the turf depth (decision 6).
    if (framed !== null && frame !== null) {
        ctx.fillStyle = c.flag;
        ctx.font = "12px system-ui, sans-serif";
        const seen = [
            ...framed.events.filter((e) => FLAGGED.has(e.kind)).map((e) => ({ t: e.t, text: FLAGGED.get(e.kind) })),
            ...framed.recontacts.map((r) => ({ t: r.start, text: r.fault ? "re-contact (fault)" : "re-contact" })),
            ...followFlags(framed),
        ].filter((f) => f.t <= view.t);
        seen.forEach((f, i) => {
            const at = frameAt(framed.frames, f.t) ?? frame;
            const [x, y] = px(at.head);
            ctx.fillText(`⚑ ${f.text}`, x + 8, y - 14 - 14 * i);
        });
        if (frame.low < 0) {
            const [x, y] = px({ x: frame.head.x, z: frame.low });
            ctx.strokeStyle = c.flag;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x - 10, y);
            ctx.lineTo(x + 10, y);
            ctx.stroke();
            ctx.fillText(`turf depth ${(-frame.low * 1000).toFixed(1)} mm`, x + 12, y + 4);
        }
    }
}

/** The events flagged on the canvas (decision 6) and their labels. */
const FLAGGED = new Map<string, string>([
    ["turf-yield", "turf yield"],
    ["impact-head-deep", "head deep"],
    ["impact-off-face", "mishit: off the face"],
    ["impact-no-strike", "mishit: no strike"],
    ["impact-mallet-grounded", "grounded"],
    ["grip-limit", "grip slipped"],
]);

/** The follow-through's flags (decision 6) and their labels; the trajectory flags them without a time. */
const FOLLOW_FLAGGED = new Map<string, string>([
    ["follow-turf-yield", "turf yield (follow-through)"],
    ["follow-head-deep", "head deep (follow-through)"],
    ["follow-grip-limit", "grip slipped (follow-through)"],
]);

/**
 * `framed`'s follow-through flags placed where they occur: the turf's at the first frame after the impact with the head
 * below the turf, the grip's at the slip, each else at the impact's end.
 */
export function followFlags(framed: FramedPlay): { t: number; text: string | undefined }[] {
    const inTurf = framed.frames.find((f) => f.t > framed.impactEnd && f.low < 0)?.t ?? framed.impactEnd;
    return framed.flags
        .filter((flag) => FOLLOW_FLAGGED.has(flag))
        .map((flag) => ({
            t: flag === "follow-grip-limit" ? (framed.slipAt ?? framed.impactEnd) : inTurf,
            text: FOLLOW_FLAGGED.get(flag),
        }));
}

/** The top-down inset (decision 7): the balls in their set-up, aim up, the split and each ball's departure. */
export function drawTopDown(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    inset: { readonly split: number; readonly departures: readonly Departure[] | null },
    c: Colours,
): void {
    ctx.fillStyle = c.background;
    ctx.fillRect(0, 0, width, height);
    const cx = width / 2;
    const cy = height * 0.75;
    const r = Math.min(width, height) * 0.06;
    const reach = height * 0.6;
    // The aim, dotted.
    ctx.strokeStyle = c.muted;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy - reach);
    ctx.stroke();
    ctx.setLineDash([]);
    const balls = [
        { x: cx, y: cy, colour: c.striker },
        { x: cx - 2 * r * Math.sin(inset.split), y: cy - 2 * r * Math.cos(inset.split), colour: c.croqueted },
    ];
    for (const b of balls) {
        ctx.fillStyle = b.colour;
        ctx.beginPath();
        ctx.arc(b.x, b.y, r, 0, 2 * Math.PI);
        ctx.fill();
    }
    ctx.font = "11px system-ui, sans-serif";
    (inset.departures ?? []).forEach((d, i) => {
        const angle = Math.atan2(d.across, d.along);
        const b = balls[i] as (typeof balls)[number];
        ctx.strokeStyle = b.colour;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - reach * Math.sin(angle), b.y - reach * Math.cos(angle));
        ctx.stroke();
        ctx.fillStyle = c.ink;
        ctx.fillText(
            `${((angle * 180) / Math.PI).toFixed(1)}°`,
            b.x - reach * 0.8 * Math.sin(angle) + 6,
            b.y - reach * 0.8,
        );
    });
    ctx.fillStyle = c.ink;
    ctx.fillText(`split ${((inset.split * 180) / Math.PI).toFixed(0)}°`, 6, 14);
}
