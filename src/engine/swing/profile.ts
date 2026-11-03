/**
 * The default swing profile, "typical club player" (P2b.2b.1 design §5.4). Every value is provisional, to be refined
 * from outcomes; P2b.2b.2 sources or fits them.
 * - Mallet: reference/mallet.json, the Pidcock 2000 11" as a rounded box on a 36 in, 0.325 kg shaft (P2b.2b.2b.2c
 *   design §5.3), its placeholders flagged at MALLET.
 * - Body: reference/contact.json (`armMass` and `reachSlack`, the prototype's calibration),
 *   the arm's flex and pendulum push (P2b.2b.2b.2b), the push intent's cap and response time, each hand's
 *   hand–arm chain (its gate rulings) and the grip's limit (Young et al. 2009; P2b.2b.2b.3), measured; the
 *   backswing's limit θ_max from reference/swing.json (`body`), a placeholder from the user's account of the stance;
 *   and the swing's effort, the linear torque–velocity law's τ_0 and ω_max from reference/swing.json (`body`),
 *   fitted by scripts/fitStrokeShape.ts to the 9.0 m/s ceiling with κ = ⅔, placeholders (P2b.2b.2c.1 design §4.3,
 *   §4.4); and the hands' peak acceleration along aim from reference/swing.json (`body`), a calibration placeholder,
 *   a body property the player never sets (P2b.2b.2c.1 design, Amendments).
 * - Stance: the hands measured from the socket along the shaft, after John Riches, Croquet Technique (Oxford Croquet),
 *   quoted per preset below. The swing presets keep their own leans. The rolls' leans are Don Gugan's measured face
 *   angles (Gugan 4, Table 6), with Riches' angles kept as cues (user decision, 2026-10-08). Each preset is defined by
 *   its lean at its typical contact. Its top hand's position at contact, the stance's input, is derived from that lean
 *   with the reference mallet and ball (P2b.2b.2b.1 design §4). The swing presets keep the top hand at the top of the
 *   handle, 0.805 m from the socket (the sourced 35 in grip less the socket's height at address). The bottom hands and
 *   the grips are the prototype's calibration (proto-two-hands, aeadd4c).
 * - Drive: the prototype's calibration (aeadd4c), compared with the coaching ratios only as observations (design §9);
 *   the AC stop's dip depth is a user decision (2026-10-05). Every preset's guideEffort is 1, the full restoration of
 *   the arc's speed a full shot aims at, except the drive's 0.75; a softer shot uses less, a very soft one none
 *   (user's account, 2026-10-06).
 *   P2b.2b.2 sets the per-type defaults; the P4 planner chooses it per shot.
 * - Shape (P2b.2b.2a design §5.3): reference/swing.json, sourced or labelled placeholders, its defaults fitted by
 *   scripts/fitStrokeShape.ts. The rolls read the hands' tempo, frozen at engine 0.12.0's fit (P2b.2b.2c.1 design
 *   §4.4); the swing presets have none (null) and swing under the body's effort.
 */
import {
    ballReference,
    contactReference,
    malletReference,
    swingBodyReference,
    swingReference,
    type StrokeShapeReference,
} from "../../reference/index";
import { faceHalfHeight } from "../impact/shape";
import { ARM_FLEX, GRIP_LIMIT, HAND_CHAIN, PENDULUM_FORCE, PUSH_FORCE, PUSH_RESPONSE_TIME } from "../impact/track";
import { handsAheadFor, headShapeOf } from "./buildContact";
import {
    STROKE_TYPES,
    type StrokeTiming,
    type StrokeType,
    type SwingDrive,
    type SwingProfile,
    type SwingShape,
    type SwingStance,
} from "./types";

const DEG = Math.PI / 180;

/**
 * A hand's breadth (m): the men's 50th percentile, 3.46 in, of the 2012 US Army anthropometric survey (ANSUR II,
 * Gordon et al. 2014) as the NCSU Ergonomics Center tabulates it (reference/sources/README.md, P2b.2b.2c.3a; user
 * ruling 2026-10-28). It is the breadth across the palm, read here as the span one hand takes on the shaft: an
 * assumption.
 */
export const HAND_BREADTH = 3.46 * 0.0254;

/**
 * The default mallet (P2b.2b.2b.2c design §5.3): the Pidcock 2000 11", a wooden body with brass blocks at its ends and
 * composite faces, as a rounded box with its measured moment about the shaft (reference/mallet.json). Placeholders
 * (design §6): the edge radius, 3 mm, unsourced; the head's mass, the face and the shaft's length, the market's typical
 * figures standing in for the Pidcock 2000's own, unpublished; the shaft's mass, derived from a fill; the shaft a thin
 * rod, its moment about its own axis 0.
 */
const MALLET: SwingProfile["mallet"] = {
    headMass: malletReference.headMass.value,
    headLength: malletReference.headLength.value,
    head: {
        kind: "box",
        faceWidth: malletReference.faceWidth.value,
        faceHeight: malletReference.faceHeight.value,
        edgeRadius: malletReference.edgeRadius.value,
        inertiaAboutShaft: malletReference.inertiaAboutShaft.value,
    },
    shaftLength: malletReference.shaftLength.value,
    shaftMass: malletReference.shaftMass.value,
};

/**
 * The reference ball and mallet each default stance's hands are derived for (P2b.2b.2b.1 design §4). R and ρ are
 * computed as defaultWorld and contactPose compute them, ρ from the default mallet itself, so an upright preset's hands
 * and its pose's B agree to the bit.
 */
const REFERENCE_GEOMETRY = {
    ballRadius: ballReference.diameter.value / 2,
    headLength: MALLET.headLength,
    faceHalfHeight: faceHalfHeight(headShapeOf(MALLET.head)),
};

/**
 * A default stance defined by its shaft's lean (rad) at contact `up` (m) on the face, its typical contact. The top hand
 * is placed where that lean puts it with the reference mallet and ball (design §4).
 */
function stanceFromLean(lean: number, up: number, hands: Omit<SwingStance, "handsAhead">): SwingStance {
    return { handsAhead: handsAheadFor(lean, hands.top, up, REFERENCE_GEOMETRY), ...hands };
}

/**
 * The shape of stroke type `type` from its reference/swing.json entry `ref` (design §5.3), all but its planned slope
 * (SLOPE_HOLD). The hands' tempo is `ref`'s or null, which takes the stroke's own free swing's fall (P2b.2b.2c.3a
 * design §4.1); a stroke that needs a tempo it cannot derive is rejected by planStroke. A swing preset's retired effort
 * keys (torqueMax, tempoSlow, tempoFast) and any preset's retired defaultIntensity are rejected by readShape when
 * swing.json loads.
 */
export function shapeOf(
    type: StrokeType,
    ref: StrokeShapeReference,
): Omit<SwingShape, "slopeHold" | "followThrough" | "holdFirmness"> {
    return {
        pendulumShare: ref.pendulumShare.value,
        handAngle: ref.handAngle.value,
        handTempo: ref.handTempo === null ? null : { slow: ref.handTempo.slow.value, fast: ref.handTempo.fast.value },
    };
}

// The rolls' pendulum phase and hands' arc (P2b.2b.2b.2b design §6): presets, not fits. pendulumAt 0.8 is where the
// reach used to begin braking, and pendulumEffort 0 lets the mallet swing. The hands' arc is a placeholder, unsourced,
// as handAngle is: a 1.5 m radius, about a standing player's shoulder height (the user's "origin much higher in the
// sky"), lowest halfway along the push (the middle of the user's "partway through the push … or at its end"). The
// swing presets carry the same four values for the type's sake and never read them.
/** The default drive per stroke type (design §5.4). Provisional throughout. */
const DRIVE: Readonly<Record<StrokeType, SwingDrive>> = {
    // Swing: the top hand still (no hand share), the pendulum's light push over 10 ms, then its free swing; no
    // dip, no reach (prototype).
    "single-ball": {
        speedGain: 0.2,
        window: 0.01,
        handGain: 0,
        handWindow: 0.01,
        handDrop: 0,
        dropTime: 0.01,
        handReach: 0,
        guideEffort: 1,
        pendulumAt: 0.8,
        pendulumEffort: 0,
        handArcRadius: 1.5,
        handArcLow: 0.5,
    },
    // As single-ball over a 5 ms window: the follow-through rises and dies by itself (prototype). The guide's effort
    // is 1, as on every preset (gate stage 2 ruling 2026-10-28, "Accept grip, set 1"; was 0.75). User decision
    // 2026-10-25 had set 0.75, the largest on a 0.25 grid after which nothing re-contacts the ball once it has parted:
    // at the old grip (bottom hand 0.6 m) and before P2b.2b.2c.3a's hand law, at 1 the head returned to it 96.4 ms
    // after contact (+49 % on its speed, a possible 29.1.6.1) and the ratio was 2.435; at 0.75 it was 3.753 (Gugan 5's
    // drive, at 0, 4.295). With the hands together (setupProbe section D) no guideEffort on the grid re-contacts the
    // ball after the parting, and the ratio is 3.9253 at every one (3.925292 at 0 to 3.925309 at 0.75 and 1).
    drive: {
        speedGain: 0.2,
        window: 0.005,
        handGain: 0,
        handWindow: 0.005,
        handDrop: 0,
        dropTime: 0.01,
        handReach: 0,
        guideEffort: 1,
        pendulumAt: 0.8,
        pendulumEffort: 0,
        handArcRadius: 1.5,
        handArcLow: 0.5,
    },
    // Swing, checked: speedGain 1 at drive −1 brings the pendulum to rest at its window's end. The check does not
    // lift the head: it still rises through the window, pitching further face-up, so its rear rim drops (8.78 mm
    // clear at contact, 7.99 mm at the window's end before the dip). The dip, fed forward in full whatever the
    // relaxed grips, takes the path's lowest point 2.99 mm below the turf at 20 ms, its rear rim first reaching
    // the turf 12.7 ms after contact, after the ball has left (measured while planning). About 11 mm, a user
    // decision (2026-10-05): the prototype's 14 mm drove the head 2.86 mm into the turf, past HEAD_DEEP_LIMIT;
    // pre-flight confirms the value. The hands do not travel, so no reach. P2b.2b.2b.2c: on the box the head clears
    // the turf at contact (14.55 mm; gate ruling B); the figures above are the round head's.
    "stop-ac": {
        speedGain: 1,
        window: 0.01,
        handGain: 0,
        handWindow: 0.01,
        handDrop: 0.011,
        dropTime: 0.02,
        handReach: 0,
        guideEffort: 1,
        pendulumAt: 0.8,
        pendulumEffort: 0,
        handArcRadius: 1.5,
        handArcLow: 0.5,
    },
    // Swing, checked through the firm, low bottom hand's lever: a hard, level shot with no follow-through; no dip
    // (prototype). A single-ball stroke, the striker's ball crossing a gap to the target (design §5.4).
    "stop-gc": {
        speedGain: 1,
        window: 0.01,
        handGain: 0,
        handWindow: 0.01,
        handDrop: 0,
        dropTime: 0.01,
        handReach: 0,
        guideEffort: 1,
        pendulumAt: 0.8,
        pendulumEffort: 0,
        handArcRadius: 1.5,
        handArcLow: 0.5,
    },
    // Carry (Riches: the slope "MAINTAINED throughout the swing", both hands moving "FORWARD at the SAME RATE",
    // "the mallet head following through the ball and onto the ground"): the hands' speed from the downswing
    // (P2b.2b.2a design §3.3), a light pendulum push. The push is minimal, 0.025 m (shapes design §8, ruling 11: "the
    // bottom hand always pushes through the contact"; was 0.15 m, the prototype's, which B1 ruling 6 found too much,
    // then 0.05 m, which ruling 14's approval halved). Its length is an assumption until the envelope phase tunes it
    // (B1 ruling 4).
    "half-roll": {
        speedGain: 0.1,
        window: 0.02,
        handGain: 0,
        handWindow: 0.02,
        handDrop: 0,
        dropTime: 0.01,
        handReach: 0.025,
        guideEffort: 1,
        pendulumAt: 0.8,
        pendulumEffort: 0,
        handArcRadius: 1.5,
        handArcLow: 0.5,
    },
    // Carry: the hands' speed from the downswing (P2b.2b.2a design §3.3) and still accelerating, the push 0.30 m
    // (prototype). The shot's default drive and window (DEFAULT_DRIVE, DEFAULT_WINDOW) shape its push.
    "full-roll": {
        speedGain: 0.1,
        window: 0.03,
        handGain: 0.1,
        handWindow: 0.03,
        handDrop: 0,
        dropTime: 0.01,
        handReach: 0.3,
        guideEffort: 1,
        pendulumAt: 0.8,
        pendulumEffort: 0,
        handArcRadius: 1.5,
        handArcLow: 0.5,
    },
    // The full roll's push (shapes design §8, ruling 17: a pass roll is a full roll with a slight split, a little more
    // lean and a subtly punchier push, set by its DEFAULT_DRIVE and DEFAULT_WINDOW). Was its own punch, speedGain 0.5
    // over 15 ms, which no lean, push length or acceleration made lawful at its 20° split.
    "pass-roll": {
        speedGain: 0.1,
        window: 0.03,
        handGain: 0.1,
        handWindow: 0.03,
        handDrop: 0,
        dropTime: 0.01,
        handReach: 0.3,
        guideEffort: 1,
        pendulumAt: 0.8,
        pendulumEffort: 0,
        handArcRadius: 1.5,
        handArcLow: 0.5,
    },
};

/**
 * The planned slope λ per stroke type (P2b.2b.2c.3a design §4.1): the swing presets' hands let the shaft swing (0), the
 * rolls' hold its slope (1), each today's downswing to the bit.
 */
export const SLOPE_HOLD: Readonly<Record<StrokeType, number>> = {
    "single-ball": 0,
    drive: 0,
    "stop-ac": 0,
    "stop-gc": 0,
    "half-roll": 1,
    "full-roll": 1,
    "pass-roll": 1,
};

/**
 * The bottom hand's carry after the push (s; shapes design §8, ruling 14), the same mechanism on every preset, the
 * model being one shot model. Carried at the push's pace, the shaft turns further on a faster push, so the
 * follow-through grows with the range. The user (2026-11-01): the full roll's is muted, "even at long range", and the
 * pass roll's text book carries on relatively further, from the end of its contact. The values are assumptions until
 * the envelope phase tunes them per shot; a stroke with no push has nothing for them to act on. The pass roll's 0.1 s
 * (ruling 18; was 0.3 s) keeps its head off the turf: from 0.15 s the carry swings the shaft through vertical with the
 * hands at their lowest and the head meets the turf (1.44 mm in at 259 ms).
 */
export const FOLLOW_THROUGH: Readonly<Record<StrokeType, number>> = {
    "single-ball": 0.2,
    drive: 0.2,
    "stop-ac": 0.2,
    "stop-gc": 0.2,
    "half-roll": 0.2,
    "full-roll": 0,
    "pass-roll": 0.1,
};

/**
 * How firmly the hands hold the shaft's lean through a push (shapes design §8, ruling 15): the share of the grip's
 * couple bounding the push's pitch hold. It sets how far the head drives the striker's ball on through contact, so
 * the ratio, and is fitted per preset to its type's target ratio at canonical power; 1 where nothing is fitted. The
 * half roll's 0.1 is bisected to ratio 2.0 on the 10 s lawn (1.9995 at 0.1002); neither firmness nor push length
 * lands the full roll's or pass roll's target, so theirs stay 1 (2026-11-01). A stroke with no push has nothing for it
 * to act on.
 */
export const HOLD_FIRMNESS: Readonly<Record<StrokeType, number>> = {
    "single-ball": 1,
    drive: 1,
    "stop-ac": 1,
    "stop-gc": 1,
    "half-roll": 0.1,
    "full-roll": 1,
    "pass-roll": 1,
};

/** The default profile (design §5.4). Provisional throughout. */
export const defaultProfile: SwingProfile = {
    mallet: MALLET,
    body: {
        armMass: contactReference.armMass.value,
        reachSlack: contactReference.reachSlack.value,
        flex: ARM_FLEX,
        pendulumForce: PENDULUM_FORCE,
        pushForce: PUSH_FORCE,
        pushResponseTime: PUSH_RESPONSE_TIME,
        chain: HAND_CHAIN,
        gripLimit: GRIP_LIMIT,
        backswingLimit: swingBodyReference.backswingLimit.value,
        headRiseLimit: swingBodyReference.headRiseLimit.value,
        effort: { torque: swingBodyReference.effortTorque.value, speed: swingBodyReference.effortSpeed.value },
        handAcceleration: swingBodyReference.handAcceleration.value,
    },
    stance: {
        // The top hand fixed at the top of the handle; the bottom hand high and light, a guide only (prototype). Riches
        // has the hands "slightly forward of the mallet head" until the instant of contact; at contact the model's are
        // over the socket (lean 0).
        "single-ball": stanceFromLean(0, 0, { top: 0.805, bottom: 0.7, gripTension: 1, bottomGrip: 0.1 }),
        // The hands together at the top of the handle, the bottom hand a hand's breadth (HAND_BREADTH) below the top,
        // firmer than single-ball's but still only a guide (P2b.2b.2c.3a design decision 3, §5; was 0.6, a third of the
        // way down). Riches, of the stop-shot: "With both hands at the top of the handle, they use the wrists to swing
        // the mallet fairly loosely from the hands." The user's account (2026-10-26): "for a drive and stop, both hands
        // would be together at the top of the shaft" ("together in that they are touching or close to touching but
        // they both grip the shaft independently, one hand above the other"); and, of the split grip, "that's
        // something we intentionally have to coach new players not to do as it really affects their ability to vary
        // their ratios. They imagine that holding the mallet is like holding a sledgehammer, which is not the case.
        // It's very much about using the natural pendulum swing." The grips are the prototype's.
        drive: stanceFromLean(0, 0, { top: 0.805, bottom: 0.805 - HAND_BREADTH, gripTension: 1, bottomGrip: 0.25 }),
        // Feet set back, the ball met on the up: the shaft leans back 5°, so the strike rises 5° and the face tilts up
        // 5°, within the feasibility spike's 3–5° tilt. User decision 2026-10-25: the stroke may rub the lawn and
        // disturb the grass but must not damage the turf, so the head must not pass the depth limit (impact-head-deep)
        // nor yield the soil (turf-yield). This stance does neither, on Gugan's mallet and the default one: the head
        // touches the turf only after the 15 ms strike window, from about 16.5 ms at 29–48 N and at most 0.9 mm in, and
        // Gugan 5's stop (ratio 7.15, band 6.55–7.75) comes to 6.66. −6° at 20 mm below the face's centre went 3.6 mm
        // deep and yielded the soil, at a ratio of 7.34; −4° at 25 mm never touches the turf but its ratio, 6.54, falls
        // just below the band; −5° at 25 mm (6.74) strikes 0.6 mm from the edge of the face's flat (±25.575 mm), so a
        // contact only 1 mm lower than the canonical one is off the face. The contact, 22.5 mm below the face's centre,
        // keeps 3 mm clear of that edge. The lean is defined at its canonical contact.
        // The grip: P2b.2b.2c.3a gate stage 2's retune (user rulings 2026-10-28, design amendment A1), the stop's own
        // grip only, against Gugan 5: the hands together at the top of the handle, as Riches has the stop-shot and the
        // user's account 3 the drive and the stop (above), the same hands as the drive's, the top hand firm (γ_T 1)
        // and the bottom hand loose (g_B 0.1). Was the prototype's bottom hand at 0.45 m and both grips at 0.1. The
        // jab variant, the bottom hand lowered (the user's account 9: "some players ... do put the bottom hand down a
        // bit to allow them to jab"), is now a shot's grip (stroke.grip), not the default. One law after contact, the
        // old grip's head sank into the turf: Gugan 5's stop came to 6.3545 at the default croquet gap (0.75 mm) and
        // 7.7325 at gap 0, each yielding the soil and passing the depth limit in its impact and its follow-through,
        // and the canonical stop's ratio was 4.9912. At this grip Gugan 5's stop is 6.6029 at 0.75 mm and 7.6089 at
        // gap 0 (band 6.55–7.75), and the canonical stop's ratio 5.0401; neither run, at either gap, yields the turf
        // or passes the depth limit, in the impact or the follow-through, the head only rubbing the lawn. In the
        // stage 2 search the top hand's tension decided the damage: every grip with γ_T at 0.25 or below damaged the
        // turf in at least one run, and only γ_T 1 (or 0.5 with the hands together and a firmer bottom hand) stayed
        // clean. The bottom hand's position, not the grips, sets the ratio: about 5.8 at 0.45 m, 6.0 at 0.55 m and
        // 6.6–6.7 from 0.6 m up, at 0.75 mm. The 0.75 mm band's pass sits on the stop's step-sensitive high branch
        // (squeezeConvergence.test.ts).
        // Shapes design §8, ruling 19 (was −5°): the lean 6° back at the same contact, for Gugan 5's ratio on the
        // default mallet. At −5° the canonical stop's ratio was 5.04, against Gugan's 6.60 on his mallet, whose head
        // is 0.899 kg against the default's 1.000 kg: the head's mass alone took the ratio from 5.04 to 5.97. At −6°
        // the canonical stop's ratio is 5.86; the head clears the turf through the impact (0.29 mm at its lowest)
        // and rubs it at most 0.93 mm in the follow-through, neither yielding the soil nor passing the depth limit.
        // The user accepts a little turf contact in the stop. 5.86 lies on a second branch: 2.5 mm above or below
        // the contact the ratio is 5.07 or 5.16. On Gugan's mallet the step no longer flips the branch: at 0.75 mm
        // the stop is 6.9323, 6.9430 and 6.9540 at dt/2, dt and 2·dt (was 5.9661, 5.9660 and 6.5810).
        "stop-ac": stanceFromLean(-6 * DEG, -0.0225, {
            top: 0.805,
            bottom: 0.805 - HAND_BREADTH,
            gripTension: 1,
            bottomGrip: 0.1,
        }),
        // The lower hand low and firm, checking the swing through its lever just after contact (prototype).
        "stop-gc": stanceFromLean(0, 0, { top: 0.805, bottom: 0.45, gripTension: 1, bottomGrip: 1 }),
        // Riches: "Stand further forward over the balls, with your front toe level with the back of your striker's
        // ball"; "Most players place the bottom hand almost half-way down the handle for this shot, leaving the other
        // hand at the top". His handle "making an angle of about 75 degrees with the ground" (a 15° lean) is a cue,
        // superseded by Gugan 4 Table 6's face angles, 23.5° and 25° (C3H, C10H): 24°, their mean to the table's 1°.
        "half-roll": stanceFromLean(24 * DEG, 0, { top: 0.805, bottom: 0.42, gripTension: 1, bottomGrip: 1 }),
        // Riches: "Your lower hand should be placed at least two-thirds of the way down the handle, and your top hand
        // will also need to be moved, to about one-third of the way down the handle"; and, to send the striker's ball
        // further, "move your hands down the handle and stand further forward to increase both the slope of the handle
        // and the fractional distance travelled by the striker's ball". His "approximately 45 degrees between the
        // mallet handle and the ground" is a cue, superseded by Gugan 4 Table 6: 31°, 29°, 33° and 30° (C1F, C3F,
        // C10F, C25F), mean 31°.
        "full-roll": stanceFromLean(31 * DEG, 0, { top: 0.61, bottom: 0.3, gripTension: 1, bottomGrip: 1 }),
        // Riches: "The bottom hand should be placed at the very bottom of the mallet shaft for this shot", the handle
        // sloping "at least as much as for a full roll" (48° until P2b.2b.2b.1), a cue superseded by Gugan 4 Table 6:
        // 36°, 34° and 32° (C3P, C10P, C25P), mean 34°. 32°, the table's lowest, a degree past the full roll's: the
        // user's view (2026-11-01) that the mean's lean plays the pass roll too far into the ground, a hypothesis.
        // Ruling 17: the full roll's grips (was top 0.45, bottom 0.09, the bottom hand at the shaft's foot), the pass
        // roll being a full roll with a little more lean.
        "pass-roll": stanceFromLean(32 * DEG, 0, { top: 0.61, bottom: 0.3, gripTension: 1, bottomGrip: 1 }),
    },
    drive: DRIVE,
    shape: Object.fromEntries(
        STROKE_TYPES.map((type) => [
            type,
            {
                ...shapeOf(type, swingReference[type]),
                slopeHold: SLOPE_HOLD[type],
                followThrough: FOLLOW_THROUGH[type],
                holdFirmness: HOLD_FIRMNESS[type],
            },
        ]),
    ) as Record<StrokeType, SwingShape>,
};

/** The planner's default `drive` per stroke type (design §5.4): −1 check … 0 coast … +1 push. */
export const DEFAULT_DRIVE: Readonly<Record<StrokeType, number>> = {
    "single-ball": 0,
    drive: 0,
    "stop-ac": -1,
    "stop-gc": -1,
    "half-roll": 1,
    "full-roll": 0.25,
    "pass-roll": 0.5,
};

/**
 * The planner's default `window` per stroke type (s); absent: the preset's. The full roll's 80 ms pulses, held for the
 * preset's 30 ms, with its default drive 0.25 are the push acceleration's fit to the ratio (shapes design §8, ruling
 * 16): 1.16 at canonical power, inside the band 1.0–1.2. No drive, window or speedGain on the sweep reached 1.1, and
 * the ratio varies by up to 0.3 between neighbouring settings, so the fit is fragile until that is understood. The pass
 * roll's 60 ms pulses with its default drive 0.5, a subtly punchier push than the full roll's, at its 4° split are its
 * fit (ruling 17): 0.81 at canonical power, against Gugan 5's 0.83.
 */
export const DEFAULT_WINDOW: Readonly<Partial<Record<StrokeType, number>>> = {
    "full-roll": 0.08,
    "pass-roll": 0.06,
};

/** Every action on time. */
export const ON_TIME: StrokeTiming = { arc: 0, hands: 0, dip: 0 };

/**
 * The planner's default timing per stroke type: every type on time. The AC stop's brake is on time too, the player
 * having "to mentally initiate before the strike but this is more cognitive than active" (user decision 2026-10-25),
 * so no stroke brakes, dips or releases early by default.
 */
export const DEFAULT_TIMING: Readonly<Record<StrokeType, StrokeTiming>> = {
    "single-ball": ON_TIME,
    drive: ON_TIME,
    "stop-ac": ON_TIME,
    "stop-gc": ON_TIME,
    "half-roll": ON_TIME,
    "full-roll": ON_TIME,
    "pass-roll": ON_TIME,
};
