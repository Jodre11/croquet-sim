/**
 * The hands' flex (P2b.2b.2b.2b design §3.1): from contact on, in carry mode, each hand applies its feed-forward plus a
 * three-dimensional spring-damper to its point on the intended path. Its stiffness rises linearly with the force the
 * arm applies voluntarily (Perreault, Kirsch and Crago 2004), driven by the feed-forward and never by the spring's own
 * force, so it has no feedback loop. Its damping holds a constant ratio on the arm's endpoint mass (Perreault 2004;
 * Fortineau et al. 2023). The numbers are reference/contact.json's arm values. Through the push the arm holds its
 * posture at its measured posture-holding stiffness (Patel, O'Neill and Artemiadis 2014) and grasp viscosity (Tsuji et
 * al. 1995), on top of the same κ·|F_ff| (gate round 11 ruling, "Posture holding in the push", 2026-10-12).
 */
import { scale, sub, type Vec3 } from "../math/vec3";
import type { FlexLaw } from "./types";

/** One hand's flex gains: its stiffness k (N/m) and damping c (N·s/m). */
export interface FlexGains {
    readonly stiffness: number;
    readonly damping: number;
}

/**
 * The gains of `law` for a hand whose feed-forward has size `force` (N), the arm holding its posture with weight
 * `hold` in [0, 1] (gate round 11 ruling, "Posture holding in the push", 2026-10-12). Rhythmic (weight 0, or no
 * `law.hold`): k = k₀ + κ·|F_ff|, c = 2·ζ·√(k·m_arm). Held (weight 1): k = k_hold + κ·|F_ff|, c = c_hold. Between them
 * each gain is the weighted mean, so a weight that moves continuously keeps the hand's force continuous.
 */
export function flexGains(law: FlexLaw, force: number, hold = 0): FlexGains {
    const stiffness = law.stiffness + law.stiffnessPerForce * force;
    const damping = 2 * law.dampingRatio * Math.sqrt(stiffness * law.endpointMass);
    if (law.hold === null || !(hold > 0)) {
        return { stiffness, damping };
    }
    const heldStiffness = law.hold.stiffness + law.stiffnessPerForce * force;
    return {
        stiffness: stiffness + (heldStiffness - stiffness) * hold,
        damping: damping + (law.hold.damping - damping) * hold,
    };
}

/**
 * One hand's force (N, world frame): F = F_ff − k·(x − x̂) − c·(v − v̂), with `offset` = x − x̂ the grip's position
 * from its intended point and `lag` = v − v̂ its velocity from the intended velocity.
 */
export function flexForce(feedForward: Vec3, gains: FlexGains, offset: Vec3, lag: Vec3): Vec3 {
    return sub(sub(feedForward, scale(offset, gains.stiffness)), scale(lag, gains.damping));
}
