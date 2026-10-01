/**
 * World construction, validation and derived geometry. `defaultWorld` is the only place the engine reads the
 * sourced reference data.
 */
import { ballReference, courtReference, frictionReference, lawnReference, lawsReference } from "../reference/index";
import { add, length, scale, vec3, type Vec3 } from "./math/vec3";
import type { ContactMaterial, Cylinder, Hoop, Lawn, MotionParams, OffsetRule, SurfaceProps, World } from "./types";

/** Standard acceleration of gravity (m/s²), as defined by the 3rd CGPM (1901). */
export const STANDARD_GRAVITY = 9.80665;

/**
 * Distance (m) beyond the boundary at which the default world halts a ball. A modelling choice, not a physical
 * constant: the spec halts balls at "a fixed margin beyond the boundary" because the surround is not modelled.
 */
export const HALT_MARGIN = 1;

/** Creates a lawn with the same surface everywhere. */
export function uniformLawn(width: number, courtLength: number, surface: SurfaceProps): Lawn {
    return { width, length: courtLength, surfaceAt: () => surface };
}

/**
 * Converts a lawn speed (seconds for a struck ball to travel `distance` metres and stop) into a rolling-resistance
 * coefficient. Uniform deceleration a over time T covers D = a·T²/2, so μr = a/g = 2D/(g·T²). The brief initial
 * sliding phase is neglected.
 */
export function rollingResistanceForLawnSpeed(seconds: number, distance: number, gravity: number): number {
    return (2 * distance) / (gravity * seconds * seconds);
}

/** Distance from a hoop's centre to each upright's axis. */
export function hoopHalfSpan(hoop: Hoop): number {
    return hoop.innerWidth / 2 + hoop.uprightRadius;
}

/** Unit vector along the hoop plane (from upright b towards upright a). */
export function hoopLateral(hoop: Hoop): Vec3 {
    return vec3(-hoop.normal.y, hoop.normal.x, 0);
}

/** Returns the hoop's two uprights as cylinders. */
export function uprightsOf(hoop: Hoop, material: ContactMaterial): readonly [Cylinder, Cylinder] {
    const offset = scale(hoopLateral(hoop), hoopHalfSpan(hoop));
    return [
        { id: `${hoop.id}/a`, centre: add(hoop.centre, offset), radius: hoop.uprightRadius, material },
        { id: `${hoop.id}/b`, centre: add(hoop.centre, scale(offset, -1)), radius: hoop.uprightRadius, material },
    ];
}

/** Returns every fixed obstacle: uprights in hoop order, then the peg. */
export function obstaclesOf(world: World): readonly Cylinder[] {
    return [...world.hoops.flatMap((h) => uprightsOf(h, world.ballUpright)), world.peg];
}

/** Returns the free-motion parameters for a segment starting at `position`. */
export function motionParamsAt(world: World, position: Vec3): MotionParams {
    const surface = world.lawn.surfaceAt(position);
    return {
        radius: world.ball.radius,
        slidingDecel: surface.slidingFriction * world.gravity,
        rollingDecel: surface.rollingResistance * world.gravity,
        gravity: world.gravity,
    };
}

/** Returns the turf's restitution and sliding friction at `position`, for impulses on a ball there. */
export function turfAt(world: World, position: Vec3): ContactMaterial {
    return { restitution: world.ballTurfRestitution, friction: world.lawn.surfaceAt(position).slidingFriction };
}

/** Evaluates a signed-offset rule for the given ball and upright radii. */
export function ruleThreshold(rule: OffsetRule, ballRadius: number, uprightRadius: number): number {
    return rule.ballRadii * ballRadius + rule.uprightRadii * uprightRadius;
}

function requirePositive(value: number, name: string): void {
    if (!(value > 0) || !Number.isFinite(value)) {
        throw new RangeError(`${name} must be a positive finite number (got ${value})`);
    }
}

function requireMaterial(material: ContactMaterial, name: string): void {
    if (!(material.restitution >= 0 && material.restitution <= 1)) {
        throw new RangeError(`${name}.restitution must lie in [0, 1] (got ${material.restitution})`);
    }
    if (!(material.friction >= 0) || !Number.isFinite(material.friction)) {
        throw new RangeError(`${name}.friction must be non-negative (got ${material.friction})`);
    }
}

/** Throws a RangeError if the world is physically meaningless. */
export function validateWorld(world: World): void {
    requirePositive(world.gravity, "gravity");
    requirePositive(world.ball.radius, "ball.radius");
    requirePositive(world.ball.mass, "ball.mass");
    requirePositive(world.lawn.width, "lawn.width");
    requirePositive(world.lawn.length, "lawn.length");
    const centre = vec3(world.lawn.width / 2, world.lawn.length / 2, 0);
    const surface = world.lawn.surfaceAt(centre);
    requirePositive(surface.slidingFriction, "lawn.slidingFriction");
    requirePositive(surface.rollingResistance, "lawn.rollingResistance");
    // Resting-contact pushing (push.ts) relies on this: it bounds every pushed ball's acceleration by the sliding
    // deceleration, which guarantees that a pushed ball's slip always decays and a pushed rolling ball never skids.
    if (surface.rollingResistance > surface.slidingFriction) {
        throw new RangeError("lawn.rollingResistance must not exceed lawn.slidingFriction");
    }
    requireMaterial(world.ballBall, "ballBall");
    requireMaterial(world.ballUpright, "ballUpright");
    requireMaterial(world.peg.material, "peg.material");
    requireMaterial({ restitution: world.ballTurfRestitution, friction: 0 }, "ballTurf");
    requirePositive(world.peg.radius, "peg.radius");
    if (!(world.haltMargin >= 0)) {
        throw new RangeError(`haltMargin must be non-negative (got ${world.haltMargin})`);
    }
    for (const hoop of world.hoops) {
        requirePositive(hoop.innerWidth, `hoop ${hoop.id} innerWidth`);
        requirePositive(hoop.uprightRadius, `hoop ${hoop.id} uprightRadius`);
        requirePositive(hoop.crownClearance, `hoop ${hoop.id} crownClearance`);
        if (Math.abs(length(hoop.normal) - 1) > 1e-12 || hoop.normal.z !== 0) {
            throw new RangeError(`hoop ${hoop.id} normal must be a horizontal unit vector`);
        }
    }
}

/** Builds the standard full-size court from the sourced reference data. */
export function defaultWorld(lawnSpeedSeconds: number = lawnReference.defaultSpeed.value): World {
    const radius = ballReference.diameter.value / 2;
    const uprightRadius = courtReference.uprightDiameter.value / 2;
    const surface: SurfaceProps = {
        slidingFriction: frictionReference.ballTurfSliding.value,
        rollingResistance: rollingResistanceForLawnSpeed(
            lawnSpeedSeconds,
            lawnReference.speedDistance.value,
            STANDARD_GRAVITY,
        ),
    };
    return {
        gravity: STANDARD_GRAVITY,
        ball: { radius, mass: ballReference.mass.value },
        lawn: uniformLawn(courtReference.width.value, courtReference.length.value, surface),
        hoops: courtReference.hoops.map((h) => ({
            id: h.id,
            centre: vec3(h.x, h.y, 0),
            normal: vec3(h.normalX, h.normalY, 0),
            innerWidth: courtReference.hoopInnerWidth.value,
            uprightRadius,
            crownClearance: courtReference.crownClearance.value,
        })),
        peg: {
            id: "peg",
            centre: vec3(courtReference.peg.x, courtReference.peg.y, 0),
            radius: courtReference.pegDiameter.value / 2,
            material: {
                restitution: frictionReference.ballPegRestitution.value,
                friction: frictionReference.ballPegFriction.value,
            },
        },
        ballBall: {
            restitution: frictionReference.ballBallRestitution.value,
            friction: frictionReference.ballBallFriction.value,
        },
        ballUpright: {
            restitution: frictionReference.ballUprightRestitution.value,
            friction: frictionReference.ballUprightFriction.value,
        },
        ballTurfRestitution: frictionReference.ballTurfRestitution.value,
        outOfCourt: lawsReference.outOfCourt,
        hoopRunStart: lawsReference.hoopRunStart,
        hoopRunComplete: lawsReference.hoopRunComplete,
        haltMargin: HALT_MARGIN,
    };
}
