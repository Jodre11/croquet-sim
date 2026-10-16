import { describe, expect, it } from "vitest";
import { IMPACT_DT, type ImpactProbe } from "../../src/engine/impact/integrate";
import { simulateImpact } from "../../src/engine/impact/simulateImpact";
import type { TrackDrive } from "../../src/engine/impact/types";
import { dot } from "../../src/engine/math/vec3";
import { simulateShot } from "../../src/engine/shot";
import { buildContact } from "../../src/engine/swing/buildContact";
import type { SwingTrajectory } from "../../src/engine/swing/trajectory";
import type { ShotSetup, StrokeType } from "../../src/engine/swing/types";
import { defaultWorld } from "../../src/engine/world";
import { backswingFor, canonicalSetup } from "./support/shot";

const WORLD = defaultWorld();
const SLOW = Boolean(import.meta.env.SLOW_TESTS);

/**
 * The regimes' setups (design §7.4), found by scripts/turfStrikeProbe.ts's regimes section over plan decision 19's
 * grids, with the strike height `up` (m) added (user ruling 2026-10-16: strike lower, up ≥ 0, small jabs)
 * (docs/superpowers/probes/2026-10-16-p2b2b2b3-regimes.txt): the first candidate of each grid that qualifies.
 */
const GRAZE = { type: "single-ball", speed: 3, up: 0.01, dip: -0.005, jab: 0.001 } as const;
const BITING = { type: "single-ball", speed: 4, up: 0.01, dip: -0.005, jab: 0.005 } as const;
const FOLLOW = { type: "half-roll", speed: 4 } as const;

/** A preset's canonical setup at `speed` (m/s), its dip `dip` s from contact and deepened by `jab` (m). */
function shot(type: StrokeType, speed: number, stroke: Partial<ShotSetup["stroke"]> = {}): ShotSetup {
    const base = canonicalSetup(type, { stroke });
    return { ...base, stroke: { ...base.stroke, backswing: backswingFor(base, speed, WORLD) } };
}

/** The impact of `setup`, and the head's speed along aim at any step's time. */
function along(setup: ShotSetup) {
    const contact = buildContact(setup, WORLD);
    const aim = (contact.drive as TrackDrive).arc.aim;
    const speeds: number[] = [dot(contact.velocity, aim)];
    const probe: ImpactProbe = {
        step: (s) => {
            speeds.push(dot(s.head.velocity, aim));
        },
    };
    const impact = simulateImpact(contact, setup.balls, WORLD, { probe });
    return { impact, speed: (t: number): number => speeds[Math.round(t / IMPACT_DT)] as number };
}

const timed = (up: number, dip: number, jab: number, extra: Partial<ShotSetup["stroke"]> = {}) => ({
    ...extra,
    jab,
    contact: { up, side: 0 },
    timing: { arc: 0, hands: 0, dip },
});

describe("the three regimes (P2b.2b.2b.3 design §7.4)", () => {
    it("grazes: the head grounds before the ball, under 2 mm, strikes it and keeps most of its speed", () => {
        // "Most" is over half its speed at the turf (plan decision 25), the probe's own qualifying test.
        // The probe: the face at 97.21 ms at 2.2377 m/s along aim, against 3.0000 m/s for the same stroke clear of the
        // turf (up 0) and 2.8217 m/s on entering the turf at 5.33 ms; then head/turf to 34.94 ms, peak 1.700 mm,
        // turf-yield. Struck 10 mm low, the dipping head scrapes the turf and ploughs it for ~92 ms before the face
        // reaches the ball: the graze's cost is power, a quarter of the stroke's speed, so the shot falls short of
        // the one attempted; the lawn's damage is secondary.
        const { impact, speed } = along(shot(GRAZE.type, GRAZE.speed, timed(GRAZE.up, GRAZE.dip, GRAZE.jab)));
        const turf = impact.timeline["head/turf"]?.[0];
        const face = impact.timeline["face/blue"]?.[0];
        expect(turf).toBeDefined();
        expect(face).toBeDefined();
        expect(turf?.start as number).toBeLessThan(face?.start as number);
        expect(impact.events.map((e) => e.kind)).not.toContain("impact-head-deep");
        expect(speed(face?.start as number)).toBeGreaterThan(0.5 * speed(turf?.start as number));
    });

    // Not gated (user ruling 2026-10-16): a dig-in is an unintentional gross mis-hit that the planner rejects by
    // design; at 1 m/s the head that grounds always reaches the ball (closest: up 0.005 m, dip −0.12 s, jab 5 mm,
    // 0.91 → 0.56 m/s, the face at 262 ms). Stopping it dead needs a relaxed gross-mis-hit rule and shaft–ball
    // contact, a future feature.
    it.todo("stops a weak stroke dead in the turf before the ball: impact-head-stopped, not impact-cap");

    it("lets a head biting in saturate a hand: grip-limit", () => {
        // The probe: head/turf 5.25–29.55 ms, peak 2.009 mm; 3.8123 m/s along aim at the turf and 3.1843 m/s at the
        // ball (face at 69.33 ms); turf-yield, impact-head-deep, grip-limit. The hard stroke, struck low, drives the
        // head past HEAD_DEEP_LIMIT, and holding it against the turf's resistance saturates a hand.
        const { impact } = along(shot(BITING.type, BITING.speed, timed(BITING.up, BITING.dip, BITING.jab)));
        expect(impact.timeline["head/turf"]).toBeDefined();
        expect(impact.events.map((e) => e.kind)).toContain("grip-limit");
    });
});

describe("the follow-through's flags (P2b.2b.2b.3 design §4.6)", () => {
    it("flags follow-turf-yield when a roll's follow-through yields the turf (design §4.6)", () => {
        // The probe: half-roll at 4 m/s, the first roll of its search to yield (2 and 3 m/s do not); the impact
        // never grounds the head (lowest 38.6 mm), the follow-through ploughs it in and runs to its cap: flags
        // follow-turf-yield, follow-head-deep, follow-cap.
        const outcome = simulateShot(shot(FOLLOW.type, FOLLOW.speed), WORLD, { trajectory: true });
        const flags = (outcome.trajectory as SwingTrajectory).flags;
        expect(flags.filter((f) => f === "follow-turf-yield")).toHaveLength(1);
    });
});

describe("Gugan's jab (P2b.2b.2b.3 design §7.3; slow)", () => {
    // P2b.2b.2b.3: failing before the gate's ruling (Task 8)
    it.runIf(SLOW).fails("puts every graze's second tap within [0.295, 0.463]·U, with at least one graze", () => {
        // Gugan 5: stop-shots with a downward jab, so that the heel's friction stops the mallet soon after impact;
        // over the seven lowest ratios the second tap's mallet speed is 0.400U, against 0.463U unrestricted, and the
        // best stop reaches 0.295U. A held-out, banded check, not a fit (design, Decisions). U and the second tap are
        // the head centre's speed along aim at the face region's first and second intervals' starts (plan decision
        // 20). A depth qualifies when the head–turf pair first closes after the first face contact begins and before
        // a second or the impact's end; a graze stays within HEAD_DEEP_LIMIT; a graze with no second tap counts 0.
        const ratios: number[] = [];
        for (let k = 0; k <= 16; k++) {
            const { impact, speed } = along(shot("stop-ac", 3, { jab: k * 0.0005 }));
            const face = impact.headRegions?.["face/blue#face"] ?? [];
            const first = face[0];
            if (first === undefined) {
                continue;
            }
            const second = face[1];
            const grounds = impact.timeline["head/turf"]?.[0]?.start;
            const qualifies =
                grounds !== undefined && grounds >= first.start && (second === undefined || grounds < second.start);
            if (qualifies && !impact.events.some((e) => e.kind === "impact-head-deep")) {
                ratios.push((second === undefined ? 0 : speed(second.start)) / speed(first.start));
            }
        }
        expect(ratios.length).toBeGreaterThan(0);
        for (const ratio of ratios) {
            expect(ratio).toBeGreaterThanOrEqual(0.295);
            expect(ratio).toBeLessThanOrEqual(0.463);
        }
    });
});
