/**
 * The default swing profile, "typical club player" (P2b.2b.1 design §5.4). Every value is provisional, to be refined
 * from outcomes; P2b.2b.2 sources or fits them.
 * - Mallet: reference/mallet.json, the Pidcock 2000 11" as a rounded box on a 36 in, 0.325 kg shaft (P2b.2b.2b.2c
 *   design §5.3), its placeholders flagged at MALLET.
 * - Body: reference/contact.json (`armMass` and `reachSlack`, the prototype's calibration),
 *   the arm's flex and pendulum push (P2b.2b.2b.2b), the push intent's cap and response time, each hand's
 *   hand–arm chain (its gate rulings) and the grip's limit (Young et al. 2009; P2b.2b.2b.3), measured; the
 *   backswing's limit θ_max from reference/swing.json (`body`), a placeholder from the user's account of the stance;
 *   and swing mode's effort, the linear torque–velocity law's τ_0 and ω_max from reference/swing.json (`body`),
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
import { ReferenceDataError } from "../../reference/schema";
import { faceHalfHeight } from "../impact/shape";
import { ARM_FLEX, GRIP_LIMIT, HAND_CHAIN, PENDULUM_FORCE, PUSH_FORCE, PUSH_RESPONSE_TIME } from "../impact/track";
import type { StrokeMode } from "../impact/types";
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
 * The shape of stroke type `type` driven in `mode`, from its reference/swing.json entry `ref` (design §5.3). A carry
 * preset reads the hands' tempo, and throws a ReferenceDataError naming the type and the keys when `ref` lacks it; a
 * swing preset takes it from `ref` or null, its effort being the body's, shared by every swing preset. A swing
 * preset's retired effort keys (torqueMax, tempoSlow, tempoFast) and any preset's retired defaultIntensity are rejected
 * by readShape when swing.json loads.
 */
export function shapeOf(type: StrokeType, mode: StrokeMode, ref: StrokeShapeReference): SwingShape {
    if (mode === "carry" && ref.handTempo === null) {
        throw new ReferenceDataError(`swing.${type}`, "a carry-mode preset needs handTempoSlow and handTempoFast");
    }
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
        mode: "swing",
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
    // As single-ball over a 5 ms window: the follow-through rises and dies by itself, and the head catches the
    // striker's ball again (prototype). User decision 2026-10-25: the guide's effort 0.75, the largest on a 0.25 grid
    // after which nothing re-contacts the ball once it has parted. At 1 the head returns to it 96.4 ms after contact
    // (+49 % on its speed, a possible 29.1.6.1) and the ratio is 2.435; at 0.75 it is 3.753 (Gugan 5's drive, at 0,
    // 4.295).
    drive: {
        mode: "swing",
        speedGain: 0.2,
        window: 0.005,
        handGain: 0,
        handWindow: 0.005,
        handDrop: 0,
        dropTime: 0.01,
        handReach: 0,
        guideEffort: 0.75,
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
        mode: "swing",
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
        mode: "swing",
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
    // (P2b.2b.2a design §3.3), a light pendulum push, the push 0.15 m (prototype).
    "half-roll": {
        mode: "carry",
        speedGain: 0.1,
        window: 0.02,
        handGain: 0,
        handWindow: 0.02,
        handDrop: 0,
        dropTime: 0.01,
        handReach: 0.15,
        guideEffort: 1,
        pendulumAt: 0.8,
        pendulumEffort: 0,
        handArcRadius: 1.5,
        handArcLow: 0.5,
    },
    // Carry: the hands' speed from the downswing (P2b.2b.2a design §3.3) and still accelerating, the push 0.30 m
    // (prototype). A known miss in this phase (design §10).
    "full-roll": {
        mode: "carry",
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
    // Carry, the bottom hand punching in contact: the pendulum's speedGain 0.5 over 15 ms from contact on top of
    // the hands' speed from the downswing (P2b.2b.2a design §3.3) and handGain 0.1. The push 0.30 m; 0.2 m traps
    // the striker's ball against the face (prototype). A known miss in this phase (design §10).
    "pass-roll": {
        mode: "carry",
        speedGain: 0.5,
        window: 0.015,
        handGain: 0.1,
        handWindow: 0.015,
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
        effort: { torque: swingBodyReference.effortTorque.value, speed: swingBodyReference.effortSpeed.value },
        handAcceleration: swingBodyReference.handAcceleration.value,
    },
    stance: {
        // The top hand fixed at the top of the handle; the bottom hand high and light, a guide only (prototype). Riches
        // has the hands "slightly forward of the mallet head" until the instant of contact; at contact the model's are
        // over the socket (lean 0).
        "single-ball": stanceFromLean(0, 0, { top: 0.805, bottom: 0.7, gripTension: 1, bottomGrip: 0.1 }),
        // As single-ball, the bottom hand a little lower and firmer, still only a guide (prototype).
        drive: stanceFromLean(0, 0, { top: 0.805, bottom: 0.6, gripTension: 1, bottomGrip: 0.25 }),
        // Feet set back, the ball met on the up: the shaft leans back 5°, so the strike rises 5° and the face tilts up
        // 5°, within the feasibility spike's 3–5° tilt. User decision 2026-10-25: the stroke may rub the lawn and
        // disturb the grass but must not damage the turf, so the head must not pass the depth limit (impact-head-deep)
        // nor yield the soil (turf-yield). This stance does neither, on Gugan's mallet and the default one: the head
        // touches the turf only after the 15 ms strike window, from about 16.5 ms at 29–48 N and at most 0.9 mm in, and
        // Gugan 5's stop (ratio 7.15, band 6.55–7.75) comes to 6.66. −6° at 20 mm below the face's centre went 3.6 mm
        // deep and yielded the soil, at a ratio of 7.34; −4° at 25 mm never touches the turf but its ratio, 6.54, falls
        // just below the band; −5° at 25 mm (6.74) strikes 0.6 mm from the edge of the face's flat (±25.575 mm), so a
        // contact only 1 mm lower than the canonical one is off the face. The contact, 22.5 mm below the face's centre,
        // keeps 3 mm clear of that edge. Both grips relax at contact (prototype). The lean is defined at its canonical
        // contact.
        "stop-ac": stanceFromLean(-5 * DEG, -0.0225, { top: 0.805, bottom: 0.45, gripTension: 0.1, bottomGrip: 0.1 }),
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
        // 36°, 34° and 32° (C3P, C10P, C25P), mean 34°.
        "pass-roll": stanceFromLean(34 * DEG, 0, { top: 0.45, bottom: 0.09, gripTension: 1, bottomGrip: 1 }),
    },
    drive: DRIVE,
    shape: Object.fromEntries(
        STROKE_TYPES.map((type) => [type, shapeOf(type, DRIVE[type].mode, swingReference[type])]),
    ) as Record<StrokeType, SwingShape>,
};

/** The planner's default `drive` per stroke type (design §5.4): −1 check … 0 coast … +1 push. */
export const DEFAULT_DRIVE: Readonly<Record<StrokeType, number>> = {
    "single-ball": 0,
    drive: 0,
    "stop-ac": -1,
    "stop-gc": -1,
    "half-roll": 1,
    "full-roll": 1,
    "pass-roll": 1,
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
