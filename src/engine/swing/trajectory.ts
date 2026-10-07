/**
 * The whole stroke's trajectory (P2b.2b.2a design §4.3): the head's pose and the hands' positions from the backswing's
 * top to the finish, for P2b.2b.3 to sweep. Before the impact the samples come from the downswing, on the path the
 * impact starts on; inside the impact and after it, from the integrator. The shaft is the segment from the socket to
 * the top hand, rigid on the head.
 */
import { FOLLOW_SAMPLE, type FollowFlag, type FollowThrough } from "../impact/integrate";
import { rotate, type Quaternion } from "../impact/rigidBody";
import { headOnPath, prepareTrack } from "../impact/track";
import type { ContactState, HeadState } from "../impact/types";
import { add, scale, vec3, type Vec3 } from "../math/vec3";

const UP = vec3(0, 0, 1);

/**
 * A downswing sample this close (s) before the impact's start is left out: the integrator's first sample stands for
 * it. Numerical, not physical: far below IMPACT_DT, so no pair of samples is ever closer than it.
 */
const SAME_INSTANT = 1e-9;

/** One sample of the whole stroke (design §4.3): the head's pose and velocity, and the hands on its shaft. */
export interface StrokeSample {
    /** s from contact. */
    readonly t: number;
    /** The head's centre, its orientation and its centre's velocity (m/s). */
    readonly head: Vec3;
    readonly orientation: Quaternion;
    readonly velocity: Vec3;
    /** The top hand (the pivot) and the bottom hand, on the shaft. */
    readonly top: Vec3;
    readonly bottom: Vec3;
}

/**
 * The whole stroke from the backswing's top to the finish, every FOLLOW_SAMPLE and at each boundary (design §4.3).
 * An impact that starts before the release (a lead longer than the downswing) starts with the head at rest at the top,
 * the hands held there until the release (a window timed before it may already swing the pendulum), so the samples
 * then start at the impact's start, and the release's sample is the integrator's first step at or after it (within
 * IMPACT_DT).
 */
export interface SwingTrajectory {
    readonly samples: readonly StrokeSample[];
    /** s from contact: the release t_r, the impact's start and end, and the finish. */
    readonly top: number;
    readonly impactStart: number;
    readonly impactEnd: number;
    readonly finish: number;
    readonly flags: readonly FollowFlag[];
}

/**
 * The trajectory of a tracked `contact` with a downswing, given its follow-through `follow` under `gravity` (design
 * §4.3): the path every FOLLOW_SAMPLE from the release until the impact starts, then `follow`'s samples. Throws a
 * RangeError for a contact state with no downswing.
 */
export function strokeTrajectory(contact: ContactState, follow: FollowThrough, gravity: number): SwingTrajectory {
    const { drive, head } = contact;
    const down = drive.kind === "track" ? drive.arc.downswing : undefined;
    if (drive.kind !== "track" || down === undefined) {
        throw new RangeError("strokeTrajectory needs a tracked contact state with a downswing");
    }
    const { arc, hands } = drive;
    const { release } = down;
    // t in s from contact; the head's state as the path or the integrator has it.
    const sample = (t: number, state: HeadState): StrokeSample => {
        const shaft = rotate(state.orientation, UP);
        const socket = add(state.position, rotate(state.orientation, head.socket));
        return {
            t,
            head: state.position,
            orientation: state.orientation,
            velocity: state.velocity,
            top: add(socket, scale(shaft, arc.radius)),
            bottom: add(socket, scale(shaft, hands.bottom)),
        };
    };
    const samples: StrokeSample[] = [];
    // Every path sample below is before the impact's start (t < 0), so no free table is read.
    const track = prepareTrack(drive, head, gravity, false);
    const impactStart = 0 - arc.contactAt;
    for (let k = 0; release + k * FOLLOW_SAMPLE < impactStart - SAME_INSTANT; k++) {
        const t = release + k * FOLLOW_SAMPLE;
        samples.push(sample(t, headOnPath(track, head, t + arc.contactAt)));
    }
    for (const s of follow.samples) {
        samples.push(sample(s.t - arc.contactAt, s.head));
    }
    return {
        samples,
        top: release,
        impactStart,
        impactEnd: follow.impactEnd - arc.contactAt,
        finish: follow.finish - arc.contactAt,
        flags: follow.flags,
    };
}
