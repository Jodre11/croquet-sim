/**
 * The band (P2b.2b.2c.3b.1 design §3): a played stroke is in the band when it reads none of the push map's misses that
 * practice can fix. The on-point test (exit criterion 4) moves here from scripts/pushMapRun.ts and
 * scripts/strokeProbe.ts, which both import it.
 */
import type { BallId, BallState } from "../types";
import { atan2 } from "../math/elementary";
import { dot, sub, vec3, type Vec3 } from "../math/vec3";
import { faceKey, headBallContact } from "./contacts";
import type { FollowThrough, ImpactSnapshot } from "./integrate";
import { rotate } from "./rigidBody";
import type { HeadState, ImpactResult, MalletHead } from "./types";

/**
 * A head's lean about the pitch axis (rad, positive with the shaft leaning forward along `aim`), as the stance's. The
 * engine's atan2 replaces the scripts' Math.atan2 (the engine's IEEE-exact rule), so a lean may differ in its last bits.
 */
export function leanOf(head: HeadState, aim: Vec3): number {
    const shaft = rotate(head.orientation, vec3(0, 0, 1));
    return atan2(dot(shaft, aim), shaft.z);
}

/** Exit criterion 4 (P2b.2b.2b.2b design §1): the head on point behind the striker's ball through the contact. */
export interface OnPoint {
    /** The least distance (m) of the head's centre behind the ball's centre along aim. */
    readonly behind: number;
    /** The highest face contact point (m) above the ball's centre. */
    readonly height: number;
    /** The largest lean (rad). */
    readonly lean: number;
    readonly holds: boolean;
}

/** What onPoint reads of an impact step. */
export type OnPointStep = Pick<ImpactSnapshot, "head" | "balls" | "contacts">;

/**
 * The head on point (exit criterion 4) over `steps`, from the first step with the face–striker pair closed to the
 * last: the head's centre behind the ball's centre along aim, every face contact point at most R·sin 45° above the
 * ball's centre, and the lean at most 45°. `striker` is the striker's index among the snapshots' balls, `id` its id,
 * `radius` the ball's radius (m). Moved from scripts/pushMapRun.ts (P2b.2b.2c.3b.1 design §3).
 */
export function onPoint(
    steps: readonly OnPointStep[],
    striker: number,
    id: BallId,
    head: MalletHead,
    aim: Vec3,
    radius: number,
): OnPoint {
    const key = `face/${id}`;
    const touching = steps.map((s) => s.contacts.some((c) => c.key === key && c.normalForce > 0));
    const first = touching.indexOf(true);
    const last = touching.lastIndexOf(true);
    let behind = Infinity;
    let height = 0 - Infinity;
    let lean = 0 - Infinity;
    for (let i = Math.max(first, 0); first >= 0 && i <= last; i++) {
        const s = steps[i] as OnPointStep;
        const ball = s.balls[striker] as BallState;
        behind = Math.min(behind, dot(sub(ball.position, s.head.position), aim));
        lean = Math.max(lean, leanOf(s.head, aim));
        const hit = headBallContact(s.head, head, ball.position, radius);
        if (hit !== null) {
            height = Math.max(height, hit.point.z - ball.position.z);
        }
    }
    const holds = behind > 0 && height <= radius * Math.SQRT1_2 && lean <= Math.PI / 4;
    return { behind, height, lean, holds };
}

/** The push map's reason for a head off point: what `point` read at its extremes. */
export function offPointReason(point: OnPoint): string {
    return (
        `off point: the head's centre ${point.behind} m behind the ball's at least, the face's contacts ` +
        `${point.height} m above it at most, the lean ${point.lean} rad at most`
    );
}

/**
 * Why a played stroke misses the band (P2b.2b.2c.3b.1 design §3), or null in it: the first, in the push map's order,
 * of `impact-off-face`, off point (`point` failing; offPointReason), `impact-head-deep`, `turf-yield`,
 * `follow-turf-yield`, `follow-head-deep`, and `impact-mallet-grounded` at or before the face's first contact with
 * `striker`'s ball (any time when the face never meets it). The grip's limit, a stroke that strikes nothing and an
 * unlawful stroke are not read: practice cannot fix them.
 */
export function bandMiss(
    run: { readonly result: ImpactResult; readonly follow: FollowThrough },
    point: OnPoint,
    striker: BallId,
): string | null {
    const { events } = run.result;
    const { flags } = run.follow;
    const event = (kind: string): boolean => events.some((e) => e.kind === kind);
    if (event("impact-off-face")) {
        return "impact-off-face";
    }
    if (!point.holds) {
        return offPointReason(point);
    }
    for (const kind of ["impact-head-deep", "turf-yield"]) {
        if (event(kind)) {
            return kind;
        }
    }
    for (const flag of ["follow-turf-yield", "follow-head-deep"] as const) {
        if (flags.includes(flag)) {
            return flag;
        }
    }
    const firstFace = run.result.timeline[faceKey(striker)]?.[0]?.start ?? Infinity;
    if (events.some((e) => e.kind === "impact-mallet-grounded" && e.t <= firstFace)) {
        return "impact-mallet-grounded";
    }
    return null;
}
