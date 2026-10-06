/**
 * The fault judge (P2b.2a design §7): the mallet faults of the Laws of Association Croquet, judged from an impact's
 * contact timeline and the stroke's context. Source: World Croquet Federation, The Laws of Association Croquet, 7th
 * edition, with the Official Rulings and Commentary, Law 29; every Law used is quoted in reference/laws.json. The
 * impact stays Law-agnostic: it records when each pair was in contact, and only this file applies the Laws.
 *
 * Tiers. A `fault` is decided by the mechanics. A `possible-fault` is one the Laws make conditional on what an
 * adjudicator sees or hears (29.2.5–29.2.7): the finding carries the measured quantity, and no perception threshold is
 * invented.
 *
 * A mallet contact is a `face/<ball>` interval: the face or its rim (C29.11.9, C29.20.2) for a force-table drive, and
 * any part of the head for a tracked drive (P2b.2b.1 design §4.5); the shaft is not modelled. Intervals are
 * [start, end) in whole steps.
 *
 * Exemption 29.2.4.1. The roquet is the striker's ball's earliest first closing on a live ball it was not touching at
 * t = 0. A mallet contact at time t is exempt from 29.1.6 and 29.1.7 if the roquet started at or before t and the
 * striker's ball hit no other object (an obstacle, or a ball other than the roqueted one; C29.20.4) after the roquet
 * started and before t. Ties favour the exemption: a face interval starting with the roquet is after it, and an object
 * hit starting with the roquet or with the contact does not intervene. A face interval already open when the roquet
 * starts is one contact, before it.
 *
 * Exemption for 29.1.7. Only the roqueted ball is excluded. The hit on any other ball, live or dead, is exempt only if
 * the mallet contact it falls in is exempt at the contact's own start (a contact already open before the roquet is
 * not), and the hit does not start after the roquet: the mallet contact, the roquet and the hit all start together
 * (Law 29.2.4: contact after the ball has hit another object after the roquet is not exempt).
 *
 * 29.1.9 ("carries force while overlapping the mallet contact") is judged at interval granularity: an obstacle
 * interval that overlaps a mallet contact counts if its `peakForce` is positive, not the force during the overlap.
 *
 * 29.1.13 has two clauses, reported in this order and told apart by their evidence: "fails to move or shake" (the
 * croqueted pair never penetrates beyond CONTACT_TOLERANCE; evidence peakPenetration), and "plays away from" (the
 * swing direction more than 90° from the line of centres: the engine's reading of C29.18.1, which sets no angular
 * test; evidence angle), judged only when the context carries the swing (P2b.2b.1 design §6.4).
 *
 * 29.1.14 (court damage) is a possible fault: a damaged lawn is something an adjudicator sees, and the Law judges its
 * effect on later strokes (C29.19.5), which the impact's plane turf does not keep. It is found when the head–turf
 * pair has an interval in a stroke of Law 29.2.3; no damage threshold is invented.
 */
import { CONTACT_TOLERANCE } from "./detect";
import { ballPairKey, faceKey, HEAD_TURF_KEY, obstacleKey } from "./impact/contacts";
import type { ContactInterval, ImpactResult } from "./impact/types";
import { atan2 } from "./math/elementary";
import { cross, dot, length, type Vec3 } from "./math/vec3";
import { BALL_IDS, type BallId } from "./types";

/** What the judge needs to know about the stroke beyond the impact (P2b.2a design §3). */
export interface StrokeContext {
    readonly striker: BallId;
    readonly kind: "single-ball" | "croquet" | "continuation-touching";
    /** Required for, and only for, a croquet stroke. */
    readonly croqueted?: BallId;
    /** Balls the striker may roquet in this stroke (decides the Law 29.2.4.1 exemption); never the striker. */
    readonly live: readonly BallId[];
    readonly hampered: boolean;
    readonly jumpAttempt: boolean;
    /** The striker's ball is part of a group of balls (29.2.3.3). */
    readonly group: boolean;
    /**
     * The swing direction, unit and horizontal (P2b.2b.1 design §6.4); absent when the judge is called without a
     * swing. In a croquet stroke it decides 29.1.13's "plays away from", with `lineOfCentres`.
     */
    readonly aim?: Vec3;
    /**
     * Unit horizontal vector from the striker's centre to the croqueted ball's at the start; required with `aim` in a
     * croquet stroke, since the impact carries no starting positions.
     */
    readonly lineOfCentres?: Vec3;
}

/** Decidable from the mechanics, or conditional on what an adjudicator perceives. */
export type FaultTier = "fault" | "possible-fault";

/**
 * One finding. `ball` is the ball it concerns: the striker's, except for 29.1.11 (the ball the mallet touched) and
 * 29.1.13 (the croqueted ball). `t` (s from the impact's start) is when it happened; 29.1.13 judges the whole impact
 * and gives its duration. `evidence` holds measured quantities in s, m, N or rad (`contacts` is a count).
 */
export interface Finding {
    readonly law: string;
    readonly tier: FaultTier;
    readonly ball: BallId;
    readonly t: number;
    readonly evidence: Readonly<Record<string, number>>;
}

/** Every finding of a stroke, in the order of the design's table; the judge does not rank them. */
export interface FaultReport {
    readonly findings: readonly Finding[];
}

/** The Laws the judge reports, each quoted in reference/laws.json. */
export const JUDGED_LAWS = [
    "29.1.5",
    "29.1.6.1",
    "29.1.6.2",
    "29.1.7",
    "29.1.8",
    "29.1.9",
    "29.1.11",
    "29.1.13",
    "29.1.14",
] as const;

const NONE: readonly ContactInterval[] = [];

/** Tolerance on a unit vector's |v|² − 1 and vertical component. Numerical, not physical: a few ulps. */
const UNIT_TOLERANCE = 1e-12;

function horizontalUnit(v: Vec3 | undefined, name: string): void {
    if (v !== undefined && !(Math.abs(v.z) <= UNIT_TOLERANCE && Math.abs(dot(v, v) - 1) <= UNIT_TOLERANCE)) {
        fail(`${name} must be a horizontal unit vector`);
    }
}

function fail(message: string): never {
    throw new RangeError(message);
}

function validate(context: StrokeContext, impact: ImpactResult): void {
    const present = (id: BallId): boolean => impact.balls[id] !== undefined;
    const { striker, croqueted } = context;
    if (!present(striker)) {
        fail(`striker ${striker} is not in the impact`);
    }
    if (context.kind === "croquet") {
        if (croqueted === undefined) {
            fail("a croquet stroke needs a croqueted ball");
        }
        if (croqueted === striker) {
            fail(`the croqueted ball cannot be the striker ${striker}`);
        }
        if (!present(croqueted)) {
            fail(`croqueted ball ${croqueted} is not in the impact`);
        }
    } else if (croqueted !== undefined) {
        fail(`croqueted is given only for a croquet stroke (got ${context.kind})`);
    }
    if (context.live.includes(striker)) {
        fail(`the striker ${striker} cannot be live`);
    }
    horizontalUnit(context.aim, "aim");
    horizontalUnit(context.lineOfCentres, "lineOfCentres");
    if (context.kind === "croquet" && context.aim !== undefined && context.lineOfCentres === undefined) {
        fail("a croquet stroke with an aim needs its lineOfCentres");
    }
}

/** The striker's view of the impact: its mallet contacts, its roquet, the objects it hit, its obstacle pairs. */
interface StrikerView {
    readonly faces: readonly ContactInterval[];
    readonly roquet: ContactInterval | null;
    /** The ball the roquet was on, or null with no roquet. */
    readonly roqueted: BallId | null;
    /** Every interval of the striker's ball with an obstacle, or with a ball other than the roqueted one. */
    readonly objects: readonly ContactInterval[];
    /** Keys of the striker's ball–obstacle pairs that were in contact, in pair order. */
    readonly obstacleKeys: readonly string[];
}

function viewOf(context: StrokeContext, impact: ImpactResult): StrikerView {
    const { striker } = context;
    const others = BALL_IDS.filter((id) => id !== striker && impact.balls[id] !== undefined);
    let roquet: ContactInterval | null = null;
    let roqueted: BallId | null = null;
    for (const id of others) {
        const key = ballPairKey(striker, id);
        const first = impact.timeline[key]?.[0];
        const eligible = context.live.includes(id) && !impact.touchingAtStart.includes(key);
        if (first && eligible && (roquet === null || first.start < roquet.start)) {
            roquet = first;
            roqueted = id;
        }
    }
    const prefix = obstacleKey(striker, "");
    const obstacleKeys = Object.keys(impact.timeline).filter((key) => key.startsWith(prefix));
    const objects = [
        ...others.filter((id) => id !== roqueted).flatMap((id) => impact.timeline[ballPairKey(striker, id)] ?? NONE),
        ...obstacleKeys.flatMap((key) => impact.timeline[key] ?? NONE),
    ];
    return { faces: impact.timeline[faceKey(striker)] ?? NONE, roquet, roqueted, objects, obstacleKeys };
}

/**
 * True when `hit`, a first hit on a ball other than the roqueted one, is exempt from 29.1.7: the mallet contact `face`
 * it falls in, the roquet and the hit all start together (spec §7; the last sentence of Law 29.2.4). The hit may not
 * start after the roquet, and the contact must itself be exempt at its own start, which already requires the roquet to
 * have started at or before it.
 */
function hitIsExempt(view: StrikerView, hit: ContactInterval, face: ContactInterval): boolean {
    const { roquet } = view;
    return roquet !== null && hit.start <= roquet.start && exempt(view, face.start);
}

/** True when a mallet contact at time t is exempt under Law 29.2.4.1 (see the file header). */
function exempt(view: StrikerView, t: number): boolean {
    const { roquet } = view;
    if (roquet === null || roquet.start > t) {
        return false;
    }
    return !view.objects.some((o) => o.start > roquet.start && o.start < t);
}

/** True when two intervals share a step. */
function overlap(a: ContactInterval, b: ContactInterval): boolean {
    return a.start < b.end && b.start < a.end;
}

/** The earliest instant at which an interval of `others` overlaps a face interval, with that interval; or null. */
function firstOverlap(
    faces: readonly ContactInterval[],
    others: readonly ContactInterval[],
): { readonly t: number; readonly face: ContactInterval; readonly other: ContactInterval } | null {
    let best: { t: number; face: ContactInterval; other: ContactInterval } | null = null;
    for (const other of others) {
        for (const face of faces) {
            if (overlap(face, other)) {
                const t = Math.max(face.start, other.start);
                if (best === null || t < best.t) {
                    best = { t, face, other };
                }
            }
        }
    }
    return best;
}

/** Evidence of a multiple contact: the count of non-exempt contacts, and each face gap (s) with its clearance (m). */
function contactEvidence(count: number, faces: readonly ContactInterval[]): Record<string, number> {
    const evidence: Record<string, number> = { contacts: count };
    for (let i = 1; i < faces.length; i++) {
        const before = faces[i - 1] as ContactInterval;
        evidence[`gap${i}`] = (faces[i] as ContactInterval).start - before.end;
        if (before.clearanceAfter !== undefined) {
            evidence[`clearance${i}`] = before.clearanceAfter;
        }
    }
    return evidence;
}

/**
 * Judges the mallet faults of a stroke from its impact (P2b.2a design §7). Throws a RangeError for a context that does
 * not fit the impact: a striker absent from it; a croquet stroke without a croqueted ball, or with the striker or an
 * absent ball as the croqueted one; a croqueted ball given for another kind of stroke; the striker listed as live; an
 * aim or line of centres that is not a horizontal unit vector, or a croquet stroke's aim without its line of centres.
 */
export function judgeFaults(context: StrokeContext, impact: ImpactResult): FaultReport {
    validate(context, impact);
    const { striker, kind } = context;
    const view = viewOf(context, impact);
    const { faces } = view;
    const findings: Finding[] = [];
    const add = (law: string, tier: FaultTier, ball: BallId, t: number, evidence: Record<string, number> = {}) => {
        findings.push({ law, tier, ball, t, evidence });
    };

    // 29.1.8: the striker's ball touches an obstacle while in contact with the mallet; one finding per obstacle.
    for (const key of view.obstacleKeys) {
        const hit = firstOverlap(faces, impact.timeline[key] ?? NONE);
        if (hit) {
            const together = Math.min(hit.face.end, hit.other.end) - hit.t;
            add("29.1.8", "fault", striker, hit.t, { obstacleForce: hit.other.peakForce, together });
        }
    }
    // 29.1.9: struck while touching an obstacle, which then carries force during a mallet contact (C29.14.1).
    for (const key of view.obstacleKeys) {
        if (!impact.touchingAtStart.includes(key)) {
            continue;
        }
        const loaded = (impact.timeline[key] ?? NONE).filter((o) => o.peakForce > 0);
        const hit = firstOverlap(faces, loaded);
        if (hit) {
            add("29.1.9", "fault", striker, hit.t, { obstacleForce: hit.other.peakForce });
        }
    }
    // 29.1.11: the mallet touches another ball.
    for (const id of BALL_IDS) {
        const touched = id === striker ? undefined : impact.timeline[faceKey(id)];
        if (touched && touched.length > 0) {
            const peakForce = touched.reduce((m, i) => Math.max(m, i.peakForce), 0);
            add("29.1.11", "fault", id, (touched[0] as ContactInterval).start, { peakForce });
        }
    }
    // 29.1.13: a croquet stroke that never presses the croqueted ball beyond CONTACT_TOLERANCE ("fails to move or
    // shake"), then one played at more than 90° from the line of centres ("plays away from", C29.18.1).
    if (kind === "croquet") {
        const croqueted = context.croqueted as BallId;
        const depth = impact.peakPenetration[ballPairKey(striker, croqueted)] ?? 0;
        if (depth <= CONTACT_TOLERANCE) {
            add("29.1.13", "fault", croqueted, impact.duration, { peakPenetration: depth });
        }
        const { aim, lineOfCentres } = context;
        if (aim !== undefined && lineOfCentres !== undefined) {
            const along = dot(aim, lineOfCentres);
            if (along < 0) {
                const angle = atan2(length(cross(aim, lineOfCentres)), along);
                add("29.1.13", "fault", croqueted, impact.duration, { angle });
            }
        }
    }
    // 29.1.14: in a stroke of Law 29.2.3, the head pressed into the turf (a possible fault; see the file header).
    const turf = impact.timeline[HEAD_TURF_KEY];
    if ((context.hampered || context.jumpAttempt || context.group) && turf && turf.length > 0) {
        add("29.1.14", "possible-fault", striker, (turf[0] as ContactInterval).start, {
            penetration: impact.peakPenetration[HEAD_TURF_KEY] ?? 0,
            peakForce: turf.reduce((m, i) => Math.max(m, i.peakForce), 0),
            slide: impact.headTurfSlide ?? 0,
        });
    }
    const contacts = faces.filter((f) => !exempt(view, f.start));
    // 29.1.6.2: a single-ball stroke with two or more non-exempt mallet contacts, or the head still closing at the end.
    if (kind === "single-ball" && contacts.length >= 2) {
        add(
            "29.1.6.2",
            "fault",
            striker,
            (contacts[1] as ContactInterval).start,
            contactEvidence(contacts.length, faces),
        );
    }
    if (kind === "single-ball") {
        for (const e of impact.events) {
            if (e.kind === "impact-head-approaching" && e.ball === striker && !exempt(view, e.t)) {
                add("29.1.6.2", "possible-fault", striker, e.t);
            }
        }
    }
    // 29.1.7: the striker's ball first hits a ball it was not touching while a mallet contact is open; the roqueted
    // ball is the roquet (exempt), any other ball, live or dead, is not (Law 29.2.4), and a croquet stroke's
    // croqueted ball never counts (C29.12.3).
    for (const id of BALL_IDS) {
        const excluded = id === striker || id === view.roqueted || (kind === "croquet" && id === context.croqueted);
        const key = ballPairKey(striker, id);
        const first = excluded ? undefined : impact.timeline[key]?.[0];
        if (!first || impact.touchingAtStart.includes(key)) {
            continue;
        }
        const face = faces.find((f) => f.start <= first.start && first.start < f.end);
        if (face && !hitIsExempt(view, first, face)) {
            add("29.1.7", "possible-fault", striker, first.start, {
                contactBefore: first.start - face.start,
                contactAfter: face.end - first.start,
            });
        }
    }
    // 29.1.6.1: a croquet stroke, or a continuation while touching, with two or more non-exempt mallet contacts.
    if (kind !== "single-ball" && contacts.length >= 2) {
        const second = contacts[1] as ContactInterval;
        add("29.1.6.1", "possible-fault", striker, second.start, contactEvidence(contacts.length, faces));
    }
    // 29.1.5: in a stroke of Law 29.2.3, the first mallet contact is at the rim (C29.10.8: the first contact only).
    if (context.hampered || context.jumpAttempt || context.group) {
        const first = faces[0];
        const rim = impact.events.find((e) => e.kind === "impact-off-face" && e.ball === striker);
        if (first && rim && rim.t <= first.start) {
            add("29.1.5", "fault", striker, first.start);
        }
    }
    return { findings };
}
