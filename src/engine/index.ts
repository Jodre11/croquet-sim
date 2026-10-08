/**
 * Public API of the croquet physics engine. The planner and renderer import from here only.
 */
export { judgeFaults, type FaultReport, type Finding, type StrokeContext } from "./faults";
export { judgeHoopRun, type HoopRunVerdict, type HoopTarget } from "./hoopRun";
export { simulateImpact } from "./impact/simulateImpact";
export type {
    ContactState,
    Coupling,
    Drive,
    Hands,
    ImpactEvent,
    ImpactResult,
    StrokeMode,
    SwingArc,
} from "./impact/types";
export { vec3, type Vec3 } from "./math/vec3";
export { stateAtTime } from "./sample";
export { simulateShot, type ShotOptions, type ShotOutcome } from "./shot";
export { ENGINE_VERSION, simulateFreeMotion } from "./simulate";
export type { SwingApproach } from "./swing/buildContact";
export { ON_TIME, defaultProfile } from "./swing/profile";
export {
    CROQUET_STROKES,
    type ShotSetup,
    type StrokeTiming,
    type StrokeType,
    type SwingDrive,
    type SwingProfile,
    type SwingShape,
    type SwingStance,
} from "./swing/types";
export type { StrokeSample, SwingTrajectory } from "./swing/trajectory";
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
