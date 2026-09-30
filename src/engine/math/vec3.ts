/**
 * Minimal immutable 3-vector maths for the engine. All quantities are SI (m, m/s, rad/s). The lawn is the plane
 * z = 0 with z up; x runs east and y north.
 */
export interface Vec3 {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/** The zero vector. */
export const ZERO: Vec3 = Object.freeze({ x: 0, y: 0, z: 0 });

/** Creates a vector. */
export function vec3(x: number, y: number, z: number): Vec3 {
    return { x, y, z };
}

/** Returns a + b. */
export function add(a: Vec3, b: Vec3): Vec3 {
    return vec3(a.x + b.x, a.y + b.y, a.z + b.z);
}

/** Returns a − b. */
export function sub(a: Vec3, b: Vec3): Vec3 {
    return vec3(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Returns k·a. */
export function scale(a: Vec3, k: number): Vec3 {
    return vec3(a.x * k, a.y * k, a.z * k);
}

/** Returns the dot product a·b. */
export function dot(a: Vec3, b: Vec3): number {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** Returns the right-handed cross product a × b. */
export function cross(a: Vec3, b: Vec3): Vec3 {
    return vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}

/** Returns |a|². */
export function lengthSq(a: Vec3): number {
    return dot(a, a);
}

/** Returns |a|. Math.sqrt is correctly rounded by IEEE-754, so this is exact across engines. */
export function length(a: Vec3): number {
    return Math.sqrt(lengthSq(a));
}

/** Returns a / |a|, or ZERO when a is the zero vector. */
export function normalize(a: Vec3): Vec3 {
    const l = length(a);
    return l === 0 ? ZERO : vec3(a.x / l, a.y / l, a.z / l);
}

/** Returns a with its vertical component removed. */
export function horizontal(a: Vec3): Vec3 {
    return vec3(a.x, a.y, 0);
}
