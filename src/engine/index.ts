/**
 * Public API of the croquet physics engine. The planner and renderer import from here only.
 */
export { judgeHoopRun, type HoopRunVerdict, type HoopTarget } from "./hoopRun";
export { vec3, type Vec3 } from "./math/vec3";
export { stateAtTime } from "./sample";
export { ENGINE_VERSION, simulateFreeMotion } from "./simulate";
export {
    BALL_IDS,
    type BallId,
    type BallParams,
    type BallState,
    type BallStates,
    type ContactMaterial,
    type Cylinder,
    type Hoop,
    type Lawn,
    type MotionParams,
    type MotionPhase,
    type OffsetRule,
    type PushMotion,
    type Segment,
    type ShotEvent,
    type ShotResult,
    type SurfaceProps,
    type World,
} from "./types";
export { STANDARD_GRAVITY, defaultWorld } from "./world";
