/**
 * The hands' flex (P2b.2b.2b.2b design §3.1): from contact on, in carry mode, each hand applies its feed-forward plus a
 * three-dimensional spring-damper to its point on the intended path. Its stiffness rises linearly with the force the
 * arm applies voluntarily (Perreault, Kirsch and Crago 2004), driven by the feed-forward and never by the spring's own
 * force, so it has no feedback loop. Its damping holds a constant ratio on the arm's endpoint mass (Perreault 2004;
 * Fortineau et al. 2023). The numbers are reference/contact.json's arm values.
 */
import { scale, sub, type Vec3 } from "../math/vec3";
import type { FlexLaw } from "./types";

/** One hand's flex gains: its stiffness k (N/m) and damping c (N·s/m). */
export interface FlexGains {
    readonly stiffness: number;
    readonly damping: number;
}

/** The gains of `law` for a hand whose feed-forward has size `force` (N): k = k₀ + κ·|F_ff|, c = 2·ζ·√(k·m_arm). */
export function flexGains(law: FlexLaw, force: number): FlexGains {
    const stiffness = law.stiffness + law.stiffnessPerForce * force;
    return { stiffness, damping: 2 * law.dampingRatio * Math.sqrt(stiffness * law.endpointMass) };
}

/**
 * One hand's force (N, world frame): F = F_ff − k·(x − x̂) − c·(v − v̂), with `offset` = x − x̂ the grip's position
 * from its intended point and `lag` = v − v̂ its velocity from the intended velocity.
 */
export function flexForce(feedForward: Vec3, gains: FlexGains, offset: Vec3, lag: Vec3): Vec3 {
    return sub(sub(feedForward, scale(offset, gains.stiffness)), scale(lag, gains.damping));
}
