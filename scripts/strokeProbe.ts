/**
 * Stroke probe (P2b.2b.2a design §8: measurements recorded in the roadmap, not gated). On the default world with the
 * default profile's canonical setups (tests/engine/support/shot.ts), reports:
 * - speeds: per preset, the planned contact speed against the backswing at intensity 0, 0.5 and 1, with the
 *   downswing's time;
 * - canonical: per preset at its default backswing, with the trajectory: the planned speed, the downswing's time and
 *   lowest clearance (and when), the lead, the impact's length, the finish's time and flags, the head's rise and
 *   travel along aim from contact to the finish (the apex, or the roll's reach), and the coaching ratio against
 *   P2b.2b.1's;
 * - fat: the canonical single-ball stroke met higher on the face (the head lower), 2 to 7 mm: the lead, the dig, and
 *   the planned against the real speed at the first face–ball contact;
 * - cost: per preset, planStroke (in swing mode the downswing and the 1.2 s free table; in carry mode neither),
 *   prepareTrack alone (with the free table in swing mode only), the impact's and the follow-through's steps and
 *   µs/step;
 * - faults: per canonical setup, the striker's face intervals and the fault judge's findings (law, tier, ball and the
 *   contacts count).
 * Run with `npx --yes tsx scripts/strokeProbe.ts`; environment: SECTION (one of the names above; default all), REPEAT
 * (timed runs per stroke, default 20). Not part of the test suite; its output goes into the roadmap's outcomes.
 */
import { IMPACT_DT } from "../src/engine/impact/integrate";
import { simulateImpact, simulateStroke } from "../src/engine/impact/simulateImpact";
import { prepareTrack } from "../src/engine/impact/track";
import type { Downswing, TrackDrive } from "../src/engine/impact/types";
import { dot, length, sub, type Vec3 } from "../src/engine/math/vec3";
import { simulateShot, type ShotOutcome } from "../src/engine/shot";
import { planStroke } from "../src/engine/swing/buildContact";
import type { StrokeSample, SwingTrajectory } from "../src/engine/swing/trajectory";
import { STROKE_TYPES, type ShotSetup, type StrokeType } from "../src/engine/swing/types";
import type { BallId, BallState } from "../src/engine/types";
import { defaultWorld } from "../src/engine/world";
import { recorder } from "../tests/engine/support/impact";
import { canonicalSetup } from "../tests/engine/support/shot";

// The project has no Node types; this script runs under tsx and reads only its environment.
declare const process: { readonly env: Readonly<Record<string, string | undefined>> };

const SECTION = process.env.SECTION ?? "all";
const REPEAT = Number(process.env.REPEAT ?? "20");
const WORLD = defaultWorld();
const fmt = (x: number, digits = 4): string => x.toFixed(digits);
const ms = (t: number): string => fmt(t * 1e3, 1);
const mm = (x: number): string => fmt(x * 1e3, 2);

/** P2b.2b.1's canonical ratios at 3 m/s (roadmap, "P2b.2b.1 outcomes carried forward"). */
const P2B2B1_RATIO: Partial<Record<StrokeType, number>> = {
    drive: 3.32,
    "stop-ac": 6.46,
    "half-roll": 2.83,
    "full-roll": 2.14,
    "pass-roll": 1.59,
};

const withStroke = (setup: ShotSetup, stroke: Partial<ShotSetup["stroke"]>): ShotSetup => ({
    ...setup,
    stroke: { ...setup.stroke, ...stroke },
});

const downOf = (outcome: { contact: ShotOutcome["contact"] }): Downswing =>
    (outcome.contact.drive as TrackDrive).arc.downswing as Downswing;

/** Croqueted ÷ striker distance from the start to rest; NaN for a single-ball stroke. */
function ratio(setup: ShotSetup, outcome: ShotOutcome): number {
    const croqueted = setup.croqueted;
    if (croqueted === undefined) {
        return NaN;
    }
    const travelled = (id: BallId): number =>
        length(sub(outcome.motion.rest[id] as Vec3, (setup.balls[id] as BallState).position));
    return travelled(croqueted) / travelled(setup.striker);
}

function speeds(): void {
    console.log("== Planned contact speed (m/s) and downswing time (ms) against backswing, intensity 0 / 0.5 / 1 ==");
    for (const type of STROKE_TYPES) {
        const base = canonicalSetup(type, { world: WORLD });
        const cells = [0.02, 0.05, 0.1, 0.2, 0.3, 0.5, 0.7].map((backswing) => {
            const row = [0, 0.5, 1].map((intensity) => {
                try {
                    const plan = planStroke(withStroke(base, { backswing, intensity }), WORLD);
                    return `${fmt(plan.contactSpeed, 3)} (${ms(0 - downOf(plan).release)})`;
                } catch (e) {
                    return `rejected (${(e as Error).message.slice(0, 48)})`;
                }
            });
            return `${fmt(backswing, 2)} m: ${row.join(" / ")}`;
        });
        console.log(`${type.padEnd(11)} ${cells.join("; ")}`);
    }
}

function canonical(): void {
    console.log("== Canonical setups at the default backswing, with the trajectory ==");
    for (const type of STROKE_TYPES) {
        const setup = canonicalSetup(type, { world: WORLD });
        const outcome = simulateShot(setup, WORLD, { trajectory: true });
        const { arc } = outcome.contact.drive as TrackDrive;
        const trajectory = outcome.trajectory as SwingTrajectory;
        const nearest = trajectory.samples.reduce((a, s) => (Math.abs(s.t) < Math.abs(a.t) ? s : a));
        const end = trajectory.samples[trajectory.samples.length - 1] as StrokeSample;
        const r = ratio(setup, outcome);
        const before = P2B2B1_RATIO[type];
        console.log(
            `${type.padEnd(11)} backswing ${mm(setup.stroke.backswing)} mm, intensity ` +
                `${fmt(setup.stroke.intensity ?? setup.profile.shape[type].defaultIntensity, 3)}, planned ` +
                `${fmt(outcome.contactSpeed)} m/s; downswing ${ms(0 - downOf(outcome).release)} ms, lowest ` +
                `${mm(outcome.approach.clearance)} mm ${ms(outcome.approach.before)} ms before contact; lead ` +
                `${ms(arc.contactAt)} ms; impact to ${ms(trajectory.impactEnd)} ms after contact; finish ` +
                `${ms(trajectory.finish)} ms [${trajectory.flags.join(", ")}]; head at the finish ` +
                `${mm(end.head.z - nearest.head.z)} mm up and ${mm(dot(sub(end.head, nearest.head), arc.aim))} mm ` +
                `along aim from contact; ratio ${Number.isNaN(r) ? "none" : fmt(r, 2)}` +
                `${before === undefined ? "" : ` (P2b.2b.1 ${fmt(before, 2)})`}`,
        );
    }
}

function fat(): void {
    console.log("== Fat strokes: the canonical single-ball stroke met higher on the face, the head lower ==");
    const base = canonicalSetup("single-ball", { world: WORLD });
    for (const up of [0.002, 0.004, 0.006, 0.007]) {
        const setup = withStroke(base, { contact: { up, side: 0 } });
        try {
            const plan = planStroke(setup, WORLD);
            const { arc } = plan.contact.drive as TrackDrive;
            const probe = recorder();
            const impact = simulateImpact(plan.contact, setup.balls, WORLD, { probe });
            const strike = (impact.timeline["face/blue"] ?? [])[0];
            const at = strike === undefined ? undefined : probe.snapshots.find((s) => s.t >= strike.start - 1e-12);
            const turf = impact.timeline["head/turf"]?.[0];
            const real = at === undefined ? "none" : fmt(length(at.head.velocity));
            const dug = turf === undefined ? "never" : `from ${ms(turf.start - arc.contactAt)} ms`;
            console.log(
                `up ${mm(up)} mm: lead ${ms(arc.contactAt)} ms, lowest ${mm(plan.approach.clearance)} mm; planned ` +
                    `${fmt(plan.contactSpeed)} m/s, real ${real} m/s at the first strike; turf ${dug}` +
                    `, ${mm(impact.peakPenetration["head/turf"] ?? 0)} mm deep; flags ` +
                    `[${impact.events.map((e) => e.kind).join(", ")}]`,
            );
        } catch (e) {
            console.log(`up ${mm(up)} mm: rejected (${(e as Error).message})`);
        }
    }
}

function cost(): void {
    console.log("== Cost (machine-dependent) ==");
    for (const type of STROKE_TYPES) {
        const setup = canonicalSetup(type, { world: WORLD });
        let start = performance.now();
        for (let i = 0; i < REPEAT; i++) {
            planStroke(setup, WORLD);
        }
        const planMs = (performance.now() - start) / REPEAT;
        const plan = planStroke(setup, WORLD);
        const down = downOf(plan);
        const downSteps = down.tempo === null ? down.theta.length - 1 : 0;
        start = performance.now();
        for (let i = 0; i < REPEAT; i++) {
            prepareTrack(plan.contact.drive as TrackDrive, plan.contact.head, WORLD.gravity);
        }
        const prepareMs = (performance.now() - start) / REPEAT;
        start = performance.now();
        let impactSteps = 0;
        for (let i = 0; i < REPEAT; i++) {
            impactSteps = simulateImpact(plan.contact, setup.balls, WORLD).steps;
        }
        const impactUs = ((performance.now() - start) * 1e3) / REPEAT;
        start = performance.now();
        let followSteps = 0;
        for (let i = 0; i < REPEAT; i++) {
            const { follow } = simulateStroke(plan.contact, setup.balls, WORLD);
            followSteps = Math.round((follow.finish - follow.impactEnd) / IMPACT_DT);
        }
        const strokeUs = ((performance.now() - start) * 1e3) / REPEAT;
        const swing = down.tempo === null;
        console.log(
            `${type.padEnd(11)} planStroke ${fmt(planMs, 2)} ms (` +
                `${swing ? `downswing ${downSteps} steps, and the free table` : ""}` +
                `${swing ? "" : "closed-form downswing, no free table"}` +
                `); prepareTrack alone ${fmt(prepareMs, 2)} ms (${swing ? "with" : "without"} the free table); ` +
                `impact ${impactSteps} steps at ${fmt(impactUs / impactSteps, 3)} µs/step; follow-through ` +
                `${followSteps} steps at ${fmt((strokeUs - impactUs) / Math.max(followSteps, 1), 3)} µs/step`,
        );
    }
}

function faults(): void {
    console.log("== Fault judge on the canonical setups: face intervals on the striker's ball, and each finding ==");
    for (const type of STROKE_TYPES) {
        const setup = canonicalSetup(type, { world: WORLD });
        const outcome = simulateShot(setup, WORLD);
        const intervals = outcome.impact.timeline[`face/${setup.striker}`]?.length ?? 0;
        const findings = outcome.faults.findings.map(
            (f) => `${f.law} ${f.tier} on ${f.ball}, contacts ${f.evidence.contacts ?? "n/a"}`,
        );
        console.log(
            `${type.padEnd(11)} ${intervals} face intervals; ` +
                `${findings.length === 0 ? "no finding" : findings.join("; ")}`,
        );
    }
}

const SECTIONS: Readonly<Record<string, () => void>> = { speeds, canonical, fat, cost, faults };
for (const [name, section] of Object.entries(SECTIONS)) {
    if (SECTION === "all" || SECTION === name) {
        section();
    }
}
