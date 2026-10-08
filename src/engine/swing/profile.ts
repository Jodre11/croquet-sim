/**
 * The default swing profile, "typical club player" (P2b.2b.1 design §5.4). Every value is provisional, to be refined
 * from outcomes; P2b.2b.2 sources or fits them.
 * - Mallet: reference/mallet.json (the head's mass, length and diameter; the 0.9144 m, 36 in, shaft, sourced).
 * - Body: reference/contact.json (`armMass` and `reachSlack`, the prototype's calibration).
 * - Stance: the hands measured from the socket along the shaft, after John Riches, Croquet Technique (Oxford Croquet),
 *   quoted per preset below. The swing presets keep their own leans. The rolls' leans are Don Gugan's measured face
 *   angles (Gugan 4, Table 6), with Riches' angles kept as cues (user decision, 2026-10-08). Each preset is defined by
 *   its lean at its typical contact. Its top hand's position at contact, the stance's input, is derived from that lean
 *   with the reference mallet and ball (P2b.2b.2b.1 design §4). The swing presets keep the top hand at the top of the
 *   handle, 0.805 m from the socket (the sourced 35 in grip less the socket's height at address). The bottom hands and
 *   the grips are the prototype's calibration (proto-two-hands, aeadd4c).
 * - Drive: the prototype's calibration (aeadd4c), compared with the coaching ratios only as observations (design §9);
 *   the AC stop's dip depth is a user decision (2026-10-05). Every preset's guideEffort is 1, the full restoration of
 *   the arc's speed a full shot aims at; a softer shot uses less, a very soft one none (user's account, 2026-10-06).
 *   P2b.2b.2 sets the per-type defaults; the P4 planner chooses it per shot.
 * - Shape (P2b.2b.2a design §5.3): reference/swing.json, sourced or labelled placeholders, its effort and tempos fitted
 *   by scripts/fitStrokeShape.ts. The swing presets read the effort and the rolls the hands' tempo; the unread member
 *   repeats the read one's tempos.
 */
import {
    ballReference,
    contactReference,
    malletReference,
    swingReference,
    type StrokeShapeReference,
} from "../../reference/index";
import { ReferenceDataError } from "../../reference/schema";
import type { StrokeMode } from "../impact/types";
import { handsAheadFor } from "./buildContact";
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
 * The reference ball and mallet each default stance's hands are derived for (P2b.2b.2b.1 design §4). R and ρ are
 * computed as defaultWorld and contactPose compute them, so an upright preset's hands and its pose's B agree to the
 * bit.
 */
const REFERENCE_GEOMETRY = {
    ballRadius: ballReference.diameter.value / 2,
    headLength: malletReference.headLength.value,
    headRadius: malletReference.headDiameter.value / 2,
};

/**
 * A default stance defined by its shaft's lean (rad) at contact `up` (m) on the face, its typical contact. The top hand
 * is placed where that lean puts it with the reference mallet and ball (design §4).
 */
function stanceFromLean(lean: number, up: number, hands: Omit<SwingStance, "handsAhead">): SwingStance {
    return { handsAhead: handsAheadFor(lean, hands.top, up, REFERENCE_GEOMETRY), ...hands };
}

/**
 * The shape of stroke type `type` driven in `mode`, from its reference/swing.json entry `ref` (design §5.3). A swing
 * preset reads the effort and a carry preset the hands' tempo; the unread member, where `ref` lacks it, repeats the
 * read one's tempos. Throws a ReferenceDataError naming the type and the keys when `ref` lacks the member `mode` reads.
 */
export function shapeOf(type: StrokeType, mode: StrokeMode, ref: StrokeShapeReference): SwingShape {
    const path = `swing.${type}`;
    let effort: SwingShape["effort"];
    let handTempo: SwingShape["handTempo"];
    if (mode === "swing") {
        if (ref.effort === null) {
            throw new ReferenceDataError(path, "a swing-mode preset needs torqueMax, tempoSlow and tempoFast");
        }
        effort = {
            torqueMax: ref.effort.torqueMax.value,
            tempoSlow: ref.effort.tempoSlow.value,
            tempoFast: ref.effort.tempoFast.value,
        };
        handTempo =
            ref.handTempo === null
                ? { slow: effort.tempoSlow, fast: effort.tempoFast }
                : { slow: ref.handTempo.slow.value, fast: ref.handTempo.fast.value };
    } else {
        if (ref.handTempo === null) {
            throw new ReferenceDataError(path, "a carry-mode preset needs handTempoSlow and handTempoFast");
        }
        handTempo = { slow: ref.handTempo.slow.value, fast: ref.handTempo.fast.value };
        // Carry mode never reads the effort: no torque.
        effort =
            ref.effort === null
                ? { torqueMax: 0, tempoSlow: handTempo.slow, tempoFast: handTempo.fast }
                : {
                      torqueMax: ref.effort.torqueMax.value,
                      tempoSlow: ref.effort.tempoSlow.value,
                      tempoFast: ref.effort.tempoFast.value,
                  };
    }
    return {
        pendulumShare: ref.pendulumShare.value,
        handAngle: ref.handAngle.value,
        effort,
        handTempo,
        defaultIntensity: ref.defaultIntensity.value,
    };
}

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
        groundDepth: 0,
        guideEffort: 1,
    },
    // As single-ball over a 5 ms window: the follow-through rises and dies by itself, and the head catches the
    // striker's ball again (prototype).
    drive: {
        mode: "swing",
        speedGain: 0.2,
        window: 0.005,
        handGain: 0,
        handWindow: 0.005,
        handDrop: 0,
        dropTime: 0.01,
        handReach: 0,
        groundDepth: 0,
        guideEffort: 1,
    },
    // Swing, checked: speedGain 1 at drive −1 brings the pendulum to rest at its window's end. The check does not
    // lift the head: it still rises through the window, pitching further face-up, so its rear rim drops (8.78 mm
    // clear at contact, 7.99 mm at the window's end before the dip). The dip, fed forward in full whatever the
    // relaxed grips, takes the path's lowest point 2.99 mm below the turf at 20 ms, its rear rim first reaching
    // the turf 12.7 ms after contact, after the ball has left (measured while planning). About 11 mm, a user
    // decision (2026-10-05): the prototype's 14 mm drove the head 2.86 mm into the turf, past HEAD_DEEP_LIMIT;
    // pre-flight confirms the value. The hands do not travel, so no reach.
    "stop-ac": {
        mode: "swing",
        speedGain: 1,
        window: 0.01,
        handGain: 0,
        handWindow: 0.01,
        handDrop: 0.011,
        dropTime: 0.02,
        handReach: 0,
        groundDepth: 0,
        guideEffort: 1,
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
        groundDepth: 0,
        guideEffort: 1,
    },
    // Carry (Riches: the slope "MAINTAINED throughout the swing", both hands moving "FORWARD at the SAME RATE",
    // "the mallet head following through the ball and onto the ground"): the hands' speed from the downswing
    // (P2b.2b.2a design §3.3), a light pendulum push, a 0.15 m reach, the head ending 5 mm below the turf
    // (prototype).
    "half-roll": {
        mode: "carry",
        speedGain: 0.1,
        window: 0.02,
        handGain: 0,
        handWindow: 0.02,
        handDrop: 0,
        dropTime: 0.01,
        handReach: 0.15,
        groundDepth: 0.005,
        guideEffort: 1,
    },
    // Carry: the hands' speed from the downswing (P2b.2b.2a design §3.3) and still accelerating, a 0.30 m reach,
    // the head ending 2 mm below the turf (prototype). A known miss in this phase (design §10).
    "full-roll": {
        mode: "carry",
        speedGain: 0.1,
        window: 0.03,
        handGain: 0.1,
        handWindow: 0.03,
        handDrop: 0,
        dropTime: 0.01,
        handReach: 0.3,
        groundDepth: 0.002,
        guideEffort: 1,
    },
    // Carry, the bottom hand punching in contact: the pendulum's speedGain 0.5 over 15 ms from contact on top of
    // the hands' speed from the downswing (P2b.2b.2a design §3.3) and handGain 0.1. A 0.30 m reach; 0.2 m traps
    // the striker's ball against the face, the head ending 2 mm below the turf (prototype). A known miss in this
    // phase (design §10).
    "pass-roll": {
        mode: "carry",
        speedGain: 0.5,
        window: 0.015,
        handGain: 0.1,
        handWindow: 0.015,
        handDrop: 0,
        dropTime: 0.01,
        handReach: 0.3,
        groundDepth: 0.002,
        guideEffort: 1,
    },
};

/** The default profile (design §5.4). Provisional throughout. */
export const defaultProfile: SwingProfile = {
    mallet: {
        headMass: malletReference.headMass.value,
        headLength: malletReference.headLength.value,
        headDiameter: malletReference.headDiameter.value,
        shaftLength: malletReference.shaftLength.value,
    },
    body: {
        armMass: contactReference.armMass.value,
        reachSlack: contactReference.reachSlack.value,
    },
    stance: {
        // The top hand fixed at the top of the handle; the bottom hand high and light, a guide only (prototype). Riches
        // has the hands "slightly forward of the mallet head" until the instant of contact; at contact the model's are
        // over the socket (lean 0).
        "single-ball": stanceFromLean(0, 0, { top: 0.805, bottom: 0.7, gripTension: 1, bottomGrip: 0.1 }),
        // As single-ball, the bottom hand a little lower and firmer, still only a guide (prototype).
        drive: stanceFromLean(0, 0, { top: 0.805, bottom: 0.6, gripTension: 1, bottomGrip: 0.25 }),
        // Feet set back, the ball met on the up: the shaft leans back 4°, so the strike rises 4° and the face tilts up
        // 4°, within the feasibility spike's 3–5° tilt (a 5° lean leaves the head only 4.03 mm clear at contact). Both
        // grips relax at contact (prototype). The lean is defined at its canonical contact, 20 mm below the face's
        // centre.
        "stop-ac": stanceFromLean(-4 * DEG, -0.02, { top: 0.805, bottom: 0.45, gripTension: 0.1, bottomGrip: 0.1 }),
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
