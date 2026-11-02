import { describe, expect, it } from "vitest";
import { openWorld } from "../../../scripts/openLawn";
import { bodyBackswing, mapSetup, textBook, type RollType } from "../../../scripts/pushMapRun";
import { bandMiss, onPoint, type OnPoint, type OnPointStep } from "../../../src/engine/impact/band";
import { faceKey } from "../../../src/engine/impact/contacts";
import type { FollowFlag, FollowThrough } from "../../../src/engine/impact/integrate";
import { simulateStroke } from "../../../src/engine/impact/simulateImpact";
import type { ContactInterval, ImpactEvent, ImpactResult } from "../../../src/engine/impact/types";
import { planStroke } from "../../../src/engine/swing/buildContact";
import { BALL_IDS, type BallId } from "../../../src/engine/types";
import { swingReference } from "../../../src/reference/index";

const WORLD = openWorld(10);
const STRIKER: BallId = "blue";
const ON: OnPoint = { behind: 0.01, height: 0, lean: 0, holds: true };
const OFF: OnPoint = { behind: -0.01, height: 0, lean: 0, holds: false };

/** A run reading only `events`, `flags` and the striker's face contact from `faceAt` (s). */
function runOf(
    events: readonly ImpactEvent[],
    flags: readonly FollowFlag[] = [],
    faceAt = 0.01,
): { readonly result: ImpactResult; readonly follow: FollowThrough } {
    const face: ContactInterval = { start: faceAt, end: faceAt + 0.001, peakForce: 1 };
    const result = { events, timeline: { [faceKey(STRIKER)]: [face] } } as unknown as ImpactResult;
    const follow = { flags } as unknown as FollowThrough;
    return { result, follow };
}

/** `type`'s text book played as the push map plays it at the power whose backswing is the type's default. */
function playTextBook(type: RollType): string | null {
    const base = mapSetup(type, textBook(type), 1);
    const power = swingReference[type].defaultBackswing.value / bodyBackswing(base, WORLD);
    const setup = mapSetup(type, textBook(type), power);
    const { contact } = planStroke(setup, WORLD);
    if (contact.drive.kind !== "track") {
        throw new Error("the text book plans a tracked drive");
    }
    const striker = BALL_IDS.filter((id) => setup.balls[id] !== undefined).indexOf(setup.striker);
    const steps: OnPointStep[] = [];
    const run = simulateStroke(contact, setup.balls, WORLD, {
        probe: {
            step(s) {
                steps.push({ head: s.head, balls: s.balls, contacts: s.contacts });
            },
        },
    });
    const point = onPoint(steps, striker, setup.striker, contact.head, contact.drive.arc.aim, WORLD.ball.radius);
    return bandMiss(run, point, setup.striker);
}

describe("the band (P2b.2b.2c.3b.1 design §3)", () => {
    it("reads today's full roll as off the face and the half roll at its canonical power in the band", () => {
        // The plan's Task 5 expected follow-turf-yield; after Tasks 1 and 3 the full hold meets the ball off the face
        // (pushMapRun.test's full roll), which bandMiss reads first.
        expect(playTextBook("full-roll")).toBe("impact-off-face");
        expect(playTextBook("half-roll")).toBeNull();
    });

    it("reads each miss alone", () => {
        expect(bandMiss(runOf([]), ON, STRIKER)).toBeNull();
        expect(bandMiss(runOf([{ kind: "impact-off-face", t: 0, ball: STRIKER }]), ON, STRIKER)).toBe(
            "impact-off-face",
        );
        expect(bandMiss(runOf([]), OFF, STRIKER)).toMatch(/^off point: /);
        expect(bandMiss(runOf([{ kind: "impact-head-deep", t: 0 }]), ON, STRIKER)).toBe("impact-head-deep");
        expect(bandMiss(runOf([{ kind: "turf-yield", t: 0 }]), ON, STRIKER)).toBe("turf-yield");
        expect(bandMiss(runOf([], ["follow-turf-yield"]), ON, STRIKER)).toBe("follow-turf-yield");
        expect(bandMiss(runOf([], ["follow-head-deep"]), ON, STRIKER)).toBe("follow-head-deep");
        expect(bandMiss(runOf([{ kind: "impact-mallet-grounded", t: 0.01 }]), ON, STRIKER)).toBe(
            "impact-mallet-grounded",
        );
    });

    it("reads the mallet grounded only at or before the face's first contact with the striker's ball", () => {
        expect(bandMiss(runOf([{ kind: "impact-mallet-grounded", t: 0.02 }]), ON, STRIKER)).toBeNull();
        const noFace = { ...runOf([{ kind: "impact-mallet-grounded", t: 5 }]) };
        const result = { ...noFace.result, timeline: {} } as ImpactResult;
        expect(bandMiss({ result, follow: noFace.follow }, ON, STRIKER)).toBe("impact-mallet-grounded");
    });

    it("leaves out what practice cannot fix", () => {
        const events: ImpactEvent[] = [
            { kind: "grip-limit", t: 0, hand: "top" },
            { kind: "impact-no-strike", t: 0 },
        ];
        expect(bandMiss(runOf(events, ["follow-grip-limit", "follow-cap"]), ON, STRIKER)).toBeNull();
    });

    it("reads the first miss in the push map's order", () => {
        const offFace: ImpactEvent = { kind: "impact-off-face", t: 0, ball: STRIKER };
        const deep: ImpactEvent = { kind: "impact-head-deep", t: 0 };
        const yielded: ImpactEvent = { kind: "turf-yield", t: 0 };
        const grounded: ImpactEvent = { kind: "impact-mallet-grounded", t: 0 };
        expect(bandMiss(runOf([deep, offFace]), OFF, STRIKER)).toBe("impact-off-face");
        expect(bandMiss(runOf([deep]), OFF, STRIKER)).toMatch(/^off point: /);
        expect(bandMiss(runOf([yielded, deep]), ON, STRIKER)).toBe("impact-head-deep");
        expect(bandMiss(runOf([yielded], ["follow-turf-yield"]), ON, STRIKER)).toBe("turf-yield");
        expect(bandMiss(runOf([], ["follow-head-deep", "follow-turf-yield"]), ON, STRIKER)).toBe("follow-turf-yield");
        expect(bandMiss(runOf([grounded], ["follow-head-deep"]), ON, STRIKER)).toBe("follow-head-deep");
    });
});
