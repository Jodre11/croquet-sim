/**
 * Validated, typed access to the sourced reference data in reference/*.json. Loading fails with a
 * ReferenceDataError if any entry is malformed or unsourced.
 */
import ballJson from "../../reference/ball.json";
import courtJson from "../../reference/court.json";
import frictionJson from "../../reference/friction.json";
import lawnJson from "../../reference/lawn.json";
import lawsJson from "../../reference/laws.json";
import {
    ReferenceDataError,
    readArray,
    readNumber,
    readQuote,
    readSourced,
    readString,
    readValue,
    type ReferenceQuote,
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

/** Laws expressed as signed-offset thresholds. */
export const lawsReference = {
    outOfCourt: readOffsetRule(lawsJson, "outOfCourt", "laws"),
    hoopRunStart: readOffsetRule(lawsJson, "hoopRunStart", "laws"),
    hoopRunComplete: readOffsetRule(lawsJson, "hoopRunComplete", "laws"),
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
