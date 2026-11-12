/**
 * The planned path (side-on viewer spec §2, §3.2, decisions 2 and 5): the planner alone, on the main thread, redrawn
 * as the inputs move.
 */
import type { FollowThrough } from "../engine/impact/integrate";
import { rotate } from "../engine/impact/rigidBody";
import { add, dot, scale, sub, vec3, type Vec3 } from "../engine/math/vec3";
import { planStroke } from "../engine/swing/buildContact";
import { strokeTrajectory } from "../engine/swing/trajectory";
import type { BallState } from "../engine/types";
import { mapSetup, openWorld, type MapPlan, type MapType } from "../lab/index";
import type { StrokeExtras } from "../lab/play";
import type { SidePoint } from "../lab/frames";

const WORLD = openWorld(10);

/** A follow-through with no samples: the trajectory then stops where the impact starts. */
const NO_FOLLOW = { samples: [], impactEnd: 0, finish: 0, flags: [] } as unknown as FollowThrough;

/** One sample of the planned path (s from contact; the aim's vertical plane, as the frames). */
export interface PathSample {
    readonly t: number;
    readonly head: SidePoint & { readonly pitch: number };
    readonly top: SidePoint;
    readonly bottom: SidePoint;
    /** The leading face's centre. */
    readonly face: SidePoint;
}

/**
 * The planned path of `plan` of `type` at power `power` (spec §3.2): planStroke on the map's set-up and the downswing
 * from the release until the impact starts, with `extras` as mapSetup takes them. Throws the planner's RangeError
 * where it rejects the set-up.
 */
export function plannedPath(type: MapType, plan: MapPlan, power: number, extras: StrokeExtras = {}): PathSample[] {
    const setup = mapSetup(type, plan, power, {}, 0, extras);
    const { contact } = planStroke(setup, WORLD);
    if (contact.drive.kind !== "track") {
        throw new RangeError("the planned contact has no tracked drive");
    }
    const { aim } = contact.drive.arc;
    const start = (setup.balls[setup.striker] as BallState).position;
    const along = (p: Vec3): number => dot(sub(p, start), aim);
    const point = (p: Vec3): SidePoint => ({ x: along(p), z: p.z });
    return strokeTrajectory(contact, NO_FOLLOW, WORLD.gravity).samples.map((s) => {
        const axis = rotate(s.orientation, vec3(1, 0, 0));
        return {
            t: s.t,
            head: { ...point(s.head), pitch: Math.atan2(axis.z, dot(axis, aim)) },
            top: point(s.top),
            bottom: point(s.bottom),
            face: point(add(s.head, scale(axis, contact.head.length / 2))),
        };
    });
}
