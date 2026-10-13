/**
 * Rigid-body kinematics of the mallet head (P2b.1 design §5): unit quaternions for its orientation, the orientation
 * update of semi-implicit Euler and Euler's equations in the body frame. Exact operations only (sinCos from
 * elementary.ts), like the rest of the engine.
 */
import { sinCos } from "../math/elementary";
import { add, cross, normalize, scale, sub, vec3, type Vec3 } from "../math/vec3";

/** A rotation as a unit quaternion w + x·i + y·j + z·k. It maps body coordinates to world coordinates. */
export interface Quaternion {
    readonly w: number;
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/** The identity rotation: body axes coincide with world axes. */
export const IDENTITY: Quaternion = Object.freeze({ w: 1, x: 0, y: 0, z: 0 });

/** The right-handed rotation by `angle` (rad) about `axis` (any non-zero length). */
export function axisAngle(axis: Vec3, angle: number): Quaternion {
    const [s, c] = sinCos(angle / 2);
    const u = scale(normalize(axis), s);
    return { w: c, x: u.x, y: u.y, z: u.z };
}

/** The product a·b: rotation b, then rotation a. */
export function multiply(a: Quaternion, b: Quaternion): Quaternion {
    return {
        w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
        x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
        y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
        z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    };
}

/** Rotates a body-frame vector into the world frame: v + w·t + u × t with t = 2·u × v (u the vector part). */
export function rotate(q: Quaternion, v: Vec3): Vec3 {
    const u = vec3(q.x, q.y, q.z);
    const t = scale(cross(u, v), 2);
    return add(add(v, scale(t, q.w)), cross(u, t));
}

/** Rotates a world-frame vector into the body frame (the conjugate rotation). */
export function rotateInverse(q: Quaternion, v: Vec3): Vec3 {
    return rotate({ w: q.w, x: 0 - q.x, y: 0 - q.y, z: 0 - q.z }, v);
}

/**
 * Advances an orientation by a world-frame angular velocity over dt: q + (dt/2)·(0, ω)·q, renormalised with √. For a
 * fixed axis this turns by 2·atan(ω·dt/2) per step, within (ω·dt)³/12 of ω·dt.
 */
export function integrateOrientation(q: Quaternion, omega: Vec3, dt: number): Quaternion {
    const h = dt / 2;
    const w = q.w - h * (omega.x * q.x + omega.y * q.y + omega.z * q.z);
    const x = q.x + h * (omega.x * q.w + omega.y * q.z - omega.z * q.y);
    const y = q.y + h * (omega.y * q.w + omega.z * q.x - omega.x * q.z);
    const z = q.z + h * (omega.z * q.w + omega.x * q.y - omega.y * q.x);
    const n = Math.sqrt(w * w + x * x + y * y + z * z);
    return { w: w / n, x: x / n, y: y / n, z: z / n };
}

/** Body-frame angular acceleration from Euler's equations, I·ω̇ = τ − ω × (I·ω), for principal moments `inertia`. */
export function angularAcceleration(inertia: Vec3, omega: Vec3, torque: Vec3): Vec3 {
    const momentum = vec3(inertia.x * omega.x, inertia.y * omega.y, inertia.z * omega.z);
    const net = sub(torque, cross(omega, momentum));
    return vec3(net.x / inertia.x, net.y / inertia.y, net.z / inertia.z);
}

/** Principal moments of a uniform solid cylinder whose axis is body x: ½·m·r² along it, m·(3r² + L²)/12 across it. */
export function solidCylinderInertia(mass: number, length: number, radius: number): Vec3 {
    const across = (mass * (3 * radius * radius + length * length)) / 12;
    return vec3(0.5 * mass * radius * radius, across, across);
}

/**
 * Principal moments of a box head (P2b.2b.2b.2c design §4.1) whose every slice along body x has the same section,
 * half-extents h_y and h_z, so its weighting varies along x alone, as end inserts do: I_z the measured moment about
 * the shaft `aboutShaft`; I_y = I_z + m·(h_z² − h_y²)/3; I_x = m·(h_y² + h_z²)/3. The edge rounding is ignored, an
 * error of order (e/h)². Throws a RangeError outside the realisable m·h_y²/3 ≤ I_z ≤ m·(L²/4 + h_y²/3), from all the
 * mass on the shaft's axis to all of it at the faces.
 */
export function boxInertia(
    mass: number,
    length: number,
    halfWidth: number,
    halfHeight: number,
    aboutShaft: number,
): Vec3 {
    const across = halfWidth * halfWidth;
    const up = halfHeight * halfHeight;
    const least = (mass * across) / 3;
    const most = mass * ((length * length) / 4 + across / 3);
    if (!(aboutShaft >= least && aboutShaft <= most)) {
        throw new RangeError(
            `the box head's moment about the shaft must lie in [${least}, ${most}] kg·m² for its mass, length and ` +
                `width (got ${aboutShaft})`,
        );
    }
    return vec3((mass * (across + up)) / 3, aboutShaft + (mass * (up - across)) / 3, aboutShaft);
}
