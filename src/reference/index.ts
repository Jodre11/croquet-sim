/**
 * Validated, typed access to the sourced reference data in reference/*.json. Loading fails with a
 * ReferenceDataError if any entry is malformed or unsourced.
 */
import ballJson from "../../reference/ball.json";
import contactJson from "../../reference/contact.json";
import courtJson from "../../reference/court.json";
import frictionJson from "../../reference/friction.json";
import lawnJson from "../../reference/lawn.json";
import lawsJson from "../../reference/laws.json";
import malletJson from "../../reference/mallet.json";
import swingJson from "../../reference/swing.json";
import {
    ReferenceDataError,
    readArray,
    readNumber,
    readQuote,
    readSourced,
    readString,
    readValue,
    type ReferenceQuote,
    type ReferenceValue,
    type Sourced,
} from "./schema";

/** A hoop's position (m) and the unit normal to its plane. */
export interface HoopPlacement {
    readonly id: string;
    readonly x: number;
    readonly y: number;
    readonly normalX: number;
    readonly normalY: number;
}

/** A Law expressed as a signed-offset threshold: ballRadii × R + uprightRadii × r. See reference/README.md. */
export interface OffsetRule extends ReferenceQuote {
    readonly ballRadii: number;
    readonly uprightRadii: number;
}

function readOffsetRule(section: unknown, key: string, path: string): OffsetRule {
    const quote = readQuote(section, key, path);
    const item = (section as Record<string, unknown>)[key];
    return {
        ...quote,
        ballRadii: readNumber(item, "ballRadii", `${path}.${key}`),
        uprightRadii: readNumber(item, "uprightRadii", `${path}.${key}`),
    };
}

function readHoops(section: unknown): readonly HoopPlacement[] {
    const hoops = (section as Record<string, unknown>)["hoops"];
    return readArray(hoops, "positions", "court.hoops").map((item, i) => {
        const path = `court.hoops.positions[${i}]`;
        return {
            id: readString(item, "id", path),
            x: readNumber(item, "x", path),
            y: readNumber(item, "y", path),
            normalX: readNumber(item, "normalX", path),
            normalY: readNumber(item, "normalY", path),
        };
    });
}

function readHoopsSource(section: unknown): Sourced {
    const hoops = (section as Record<string, unknown>)["hoops"];
    if (hoops === undefined) {
        throw new ReferenceDataError("court.hoops", "missing");
    }
    return readSourced(hoops, "court.hoops");
}

function readPeg(section: unknown): { readonly x: number; readonly y: number } & Sourced {
    const peg = (section as Record<string, unknown>)["pegPosition"];
    return {
        x: readNumber(peg, "x", "court.pegPosition"),
        y: readNumber(peg, "y", "court.pegPosition"),
        ...readSourced(peg, "court.pegPosition"),
    };
}

/** Official ball specification. */
export const ballReference = {
    diameter: readValue(ballJson, "diameter", "ball"),
    mass: readValue(ballJson, "mass", "ball"),
    rebound: readQuote(ballJson, "rebound", "ball"),
} as const;

/** Court dimensions and standard setting. */
export const courtReference = {
    length: readValue(courtJson, "length", "court"),
    width: readValue(courtJson, "width", "court"),
    hoopInnerWidth: readValue(courtJson, "hoopInnerWidth", "court"),
    uprightDiameter: readValue(courtJson, "uprightDiameter", "court"),
    crownClearance: readValue(courtJson, "crownClearance", "court"),
    pegDiameter: readValue(courtJson, "pegDiameter", "court"),
    layout: readQuote(courtJson, "layout", "court"),
    hoops: readHoops(courtJson),
    hoopsSource: readHoopsSource(courtJson),
    peg: readPeg(courtJson),
} as const;

/** Law 29 (faults) and the Glossary entries the fault judge relies on, keyed by Law number (reference/laws.json). */
export const FAULT_LAW_KEYS = [
    "29.1.5",
    "29.1.6.1",
    "29.1.6.2",
    "29.1.6.3",
    "29.1.7",
    "29.1.8",
    "29.1.9",
    "29.1.11",
    "29.1.13",
    "29.1.14",
    "29.2.3",
    "29.2.4",
    "29.2.5",
    "29.2.6",
    "29.2.7",
    "groupOfBalls",
] as const;

/** A key of `lawsReference.faults`. */
export type FaultLawKey = (typeof FAULT_LAW_KEYS)[number];

function readFaultLaws(section: unknown): Readonly<Record<FaultLawKey, ReferenceQuote>> {
    return Object.fromEntries(FAULT_LAW_KEYS.map((key) => [key, readQuote(section, key, "laws")])) as Record<
        FaultLawKey,
        ReferenceQuote
    >;
}

/** Laws expressed as signed-offset thresholds, and the quoted Laws of the fault judge. */
export const lawsReference = {
    outOfCourt: readOffsetRule(lawsJson, "outOfCourt", "laws"),
    hoopRunStart: readOffsetRule(lawsJson, "hoopRunStart", "laws"),
    hoopRunComplete: readOffsetRule(lawsJson, "hoopRunComplete", "laws"),
    faults: readFaultLaws(lawsJson),
} as const;

/** Lawn-speed definition and typical value. */
export const lawnReference = {
    speedDefinition: readQuote(lawnJson, "speedDefinition", "lawn"),
    speedDistance: readValue(lawnJson, "speedDistance", "lawn"),
    defaultSpeed: readValue(lawnJson, "defaultSpeed", "lawn"),
} as const;

/** Free-motion friction and restitution coefficients. */
export const frictionReference = {
    ballTurfSliding: readValue(frictionJson, "ballTurfSliding", "friction"),
    ballBallRestitution: readValue(frictionJson, "ballBallRestitution", "friction"),
    ballBallFriction: readValue(frictionJson, "ballBallFriction", "friction"),
    ballUprightRestitution: readValue(frictionJson, "ballUprightRestitution", "friction"),
    ballUprightFriction: readValue(frictionJson, "ballUprightFriction", "friction"),
    ballPegRestitution: readValue(frictionJson, "ballPegRestitution", "friction"),
    ballPegFriction: readValue(frictionJson, "ballPegFriction", "friction"),
    ballTurfRestitution: readValue(frictionJson, "ballTurfRestitution", "friction"),
} as const;

/**
 * Impact-phase contact data: turf stiffness, contact durations, the tangential ratio, the hand coupling, the default
 * body's arm mass and reach slack, and the head–turf pair.
 */
export const contactReference = {
    ballTurfStiffness: readValue(contactJson, "ballTurfStiffness", "contact"),
    ballBallContactTime: readValue(contactJson, "ballBallContactTime", "contact"),
    ballObstacleContactTime: readValue(contactJson, "ballObstacleContactTime", "contact"),
    faceBallContactTime: readValue(contactJson, "faceBallContactTime", "contact"),
    tangentialStiffnessRatio: readValue(contactJson, "tangentialStiffnessRatio", "contact"),
    handCouplingPeriod: readValue(contactJson, "handCouplingPeriod", "contact"),
    handCouplingDampingRatio: readValue(contactJson, "handCouplingDampingRatio", "contact"),
    armMass: readValue(contactJson, "armMass", "contact"),
    reachSlack: readValue(contactJson, "reachSlack", "contact"),
    headTurfFriction: readValue(contactJson, "headTurfFriction", "contact"),
    headDeepLimit: readValue(contactJson, "headDeepLimit", "contact"),
} as const;

/** One mallet face, one typical round head and the default shaft (P2b.1, P2b.2b.1). */
export const malletReference = {
    faceRestitution: readValue(malletJson, "faceRestitution", "mallet"),
    faceFriction: readValue(malletJson, "faceFriction", "mallet"),
    headMass: readValue(malletJson, "headMass", "mallet"),
    headLength: readValue(malletJson, "headLength", "mallet"),
    headDiameter: readValue(malletJson, "headDiameter", "mallet"),
    shaftLength: readValue(malletJson, "shaftLength", "mallet"),
} as const;

/** The stroke types reference/swing.json keys, in the presets' order (the engine's STROKE_TYPES). */
export const SWING_REFERENCE_TYPES = [
    "single-ball",
    "drive",
    "stop-ac",
    "stop-gc",
    "half-roll",
    "full-roll",
    "pass-roll",
] as const;

/** A key of `swingReference`. */
export type SwingReferenceType = (typeof SWING_REFERENCE_TYPES)[number];

/**
 * A sourced kinematic pair (P2b.2b.2a design §6.1): a backswing (m, the head centre's rise) against the contact speed
 * (m/s) or the downswing time (s) measured with it; exactly one of the two.
 */
export interface KinematicPair extends Sourced {
    readonly backswing: number;
    readonly contactSpeed: number | null;
    readonly downswingTime: number | null;
}

/** One stroke type's stroke-shape figures (reference/swing.json; P2b.2b.2a design §6). */
export interface StrokeShapeReference {
    readonly pendulumShare: ReferenceValue;
    readonly handAngle: ReferenceValue;
    /** The sourced backswing range (m), or null where none was found. */
    readonly backswingRange: { readonly low: ReferenceValue; readonly high: ReferenceValue } | null;
    readonly finish: ReferenceQuote;
    /** The rolls' sourced tempo, or null. */
    readonly tempo: ReferenceQuote | null;
    readonly kinematics: readonly KinematicPair[];
    /** The fit's default backswing (m) and intensity, and the planned speed (m/s) they give (design §5.3). */
    readonly defaultBackswing: ReferenceValue;
    readonly defaultIntensity: ReferenceValue;
    readonly defaultSpeed: ReferenceValue;
    /** Swing mode's effort (the swing presets), or null. */
    readonly effort: {
        readonly torqueMax: ReferenceValue;
        readonly tempoSlow: ReferenceValue;
        readonly tempoFast: ReferenceValue;
    } | null;
    /** Carry mode's hands' tempo (the rolls), or null. */
    readonly handTempo: { readonly slow: ReferenceValue; readonly fast: ReferenceValue } | null;
}

function has(section: unknown, key: string): boolean {
    return typeof section === "object" && section !== null && key in section;
}

function readPairs(entry: unknown, path: string): readonly KinematicPair[] {
    if (!has(entry, "kinematics")) {
        return [];
    }
    return readArray(entry, "kinematics", path).map((item, i) => {
        const at = `${path}.kinematics[${i}]`;
        const contactSpeed = has(item, "contactSpeed") ? readNumber(item, "contactSpeed", at) : null;
        const downswingTime = has(item, "downswingTime") ? readNumber(item, "downswingTime", at) : null;
        if ((contactSpeed === null) === (downswingTime === null)) {
            throw new ReferenceDataError(at, "must give exactly one of contactSpeed and downswingTime");
        }
        return {
            backswing: readNumber(item, "backswing", at),
            contactSpeed,
            downswingTime,
            ...readSourced(item, at),
        };
    });
}

function readShape(section: unknown, type: SwingReferenceType): StrokeShapeReference {
    const path = `swing.${type}`;
    if (!has(section, type)) {
        throw new ReferenceDataError(path, "missing");
    }
    const entry = (section as Record<string, unknown>)[type];
    const low = has(entry, "backswingLow");
    if (low !== has(entry, "backswingHigh")) {
        throw new ReferenceDataError(path, "backswingLow and backswingHigh must be given together");
    }
    const backswingRange = low
        ? { low: readValue(entry, "backswingLow", path), high: readValue(entry, "backswingHigh", path) }
        : null;
    if (backswingRange !== null && !(backswingRange.low.value <= backswingRange.high.value)) {
        throw new ReferenceDataError(path, "backswingLow must not exceed backswingHigh");
    }
    return {
        pendulumShare: readValue(entry, "pendulumShare", path),
        handAngle: readValue(entry, "handAngle", path),
        backswingRange,
        finish: readQuote(entry, "finish", path),
        tempo: has(entry, "tempo") ? readQuote(entry, "tempo", path) : null,
        kinematics: readPairs(entry, path),
        defaultBackswing: readValue(entry, "defaultBackswing", path),
        defaultIntensity: readValue(entry, "defaultIntensity", path),
        defaultSpeed: readValue(entry, "defaultSpeed", path),
        effort: has(entry, "tempoSlow")
            ? {
                  torqueMax: readValue(entry, "torqueMax", path),
                  tempoSlow: readValue(entry, "tempoSlow", path),
                  tempoFast: readValue(entry, "tempoFast", path),
              }
            : null,
        handTempo: has(entry, "handTempoSlow")
            ? { slow: readValue(entry, "handTempoSlow", path), fast: readValue(entry, "handTempoFast", path) }
            : null,
    };
}

/**
 * The stroke shape per stroke type (P2b.2b.2a design §6): sourced figures, labelled placeholders and the fit's derived
 * defaults (scripts/fitStrokeShape.ts).
 */
export const swingReference: Readonly<Record<SwingReferenceType, StrokeShapeReference>> = Object.fromEntries(
    SWING_REFERENCE_TYPES.map((type) => [type, readShape(swingJson, type)]),
) as Record<SwingReferenceType, StrokeShapeReference>;
