/**
 * The stroke-shape fit (P2b.2b.2a design §5.3, §6.2), for each stroke type in the presets' order:
 * 1. h₀, the backswing that gives CANONICAL_SPEED at intensity 0 (swing mode: gravity alone, the effort unread;
 *    carry mode: the hands at handTempo.slow);
 * 2. swing mode's effort, a labelled placeholder: tempoSlow the gravity-only fall time from h₀, tempoFast half of it,
 *    and torqueMax by bisection so that intensity 1 from h₀ gives SPEED_FACTOR times the speed; carry mode's tempo,
 *    a sourced handTempoSlow if swing.json holds one, else the placeholder (the single-ball stroke's gravity-only fall
 *    time from its h₀), the fast tempo half of it, so intensity 1 doubles the speed. The sourced-handTempoSlow branch
 *    is dead on today's data (no numeric roll tempo was sourced); it is kept for when one is;
 * 3. the default: h₀ at intensity 0 if no range was sourced or the sourced range holds h₀; otherwise the range's
 *    nearest bound, at the intensity in [0, 1] whose speed is nearest CANONICAL_SPEED (by bisection where one
 *    reaches it). That is the nearest-speed rule: intensity 0 when even intensity 0 reaches CANONICAL_SPEED at the
 *    bound, 1 when even intensity 1 stays at or below it. It departs from design §5.3's "1 when unreachable" by user
 *    decision (2026-10-07).
 * Then the planned speed at h₀ for intensity 0, 0.25, 0.5, 0.75 and 1 must rise strictly with intensity, for the
 * bisections on intensity assume it (it need not when torqueMax is small beside m·g·ℓ_h); the fit throws naming the
 * stroke type if not, and prints the five speeds to stderr.
 * Never fitted to a ratio (design §6.2). Prints reference/swing.json with its derived entries replaced to stdout and
 * a summary to stderr. Run with `npx --yes tsx scripts/fitStrokeShape.ts > <file>`, copy the file over
 * reference/swing.json and run Prettier on it. Throws if any stroke type has kinematic pairs (plan Task 4 Step 2).
 */
import swingJson from "../reference/swing.json";
import type { Hands, StrokeMode } from "../src/engine/impact/types";
import { contactPose, downswingInput, poseSpeed, type ContactPose } from "../src/engine/swing/buildContact";
import { MAX_BACK_ANGLE, planDownswing, type PlannedDownswing } from "../src/engine/swing/downswing";
import { defaultProfile } from "../src/engine/swing/profile";
import type { StrokeType, SwingShape } from "../src/engine/swing/types";
import { defaultWorld } from "../src/engine/world";
import { SWING_REFERENCE_TYPES, swingReference } from "../src/reference/index";
import { canonicalSetup } from "../tests/engine/support/shot";

/** P2b.2b.1's canonical contact speed (m/s), so the defaults' figures stay comparable (design exit criterion 5). */
const CANONICAL_SPEED = 3;

/** Intensity 1 from h₀ gives this many times the intensity-0 speed (design §6.2). */
const SPEED_FACTOR = 2;

/** Halvings of every bisection: to a double's resolution. */
const BISECTIONS = 60;

/** The intensities whose planned speeds must rise strictly (the monotonicity check). */
const PROBE_INTENSITIES = [0, 0.25, 0.5, 0.75, 1] as const;

/** The source every derived entry cites. */
const FIT_SOURCE =
    "scripts/fitStrokeShape.ts: P2b.2b.2a design §5.3 and §6.2 " +
    "(docs/superpowers/specs/2026-10-06-p2b2b2a-stroke-shape-design.md)";

const WORLD = defaultWorld();

/** One stroke type's fixed inputs: its contact pose, hands, mode and sourced shape (effort and tempo unset). */
interface Case {
    readonly type: StrokeType;
    readonly pose: ContactPose;
    readonly hands: Hands;
    readonly mode: StrokeMode;
    readonly shape: SwingShape;
}

function caseOf(type: StrokeType): Case {
    const stance = defaultProfile.stance[type];
    const ref = swingReference[type];
    return {
        type,
        pose: contactPose(canonicalSetup(type, { world: WORLD }), WORLD),
        hands: {
            bottom: stance.bottom,
            gripTension: stance.gripTension,
            bottomGrip: stance.bottomGrip,
            armMass: defaultProfile.body.armMass,
            reachSlack: defaultProfile.body.reachSlack,
            guideEffort: 1,
        },
        mode: defaultProfile.drive[type].mode,
        shape: {
            pendulumShare: ref.pendulumShare.value,
            handAngle: ref.handAngle.value,
            effort: { torqueMax: 0, tempoSlow: 1, tempoFast: 0.5 },
            handTempo: { slow: 1, fast: 0.5 },
            defaultIntensity: 0,
        },
    };
}

function plan(c: Case, shape: SwingShape, backswing: number, intensity: number): PlannedDownswing {
    const choice = { mode: c.mode, shape, backswing, intensity };
    return planDownswing(downswingInput(c.pose, c.hands, choice, WORLD.gravity));
}

function speed(c: Case, shape: SwingShape, backswing: number, intensity: number): number {
    return poseSpeed(c.pose, plan(c, shape, backswing, intensity));
}

/** The largest backswing the pendulum's share allows (design §3.2), a hair short of the shaft horizontal. */
function maxBackswing(c: Case): number {
    const lever = c.pose.head.socket.z + c.pose.radius;
    const share = c.shape.pendulumShare;
    const room = lever * (Math.cos(c.pose.thetaContact) - Math.cos(MAX_BACK_ANGLE));
    return share > 0 ? (room / share) * (1 - 1e-9) : 2;
}

/** The x in (lo, hi] at which the increasing `f` reaches `target`, by bisection. Throws if f(hi) falls short. */
function solve(f: (x: number) => number, target: number, lo: number, hi: number): number {
    if (f(hi) < target) {
        throw new Error(`the target ${target} is beyond reach: ${f(hi)} at ${hi}`);
    }
    let a = lo;
    let b = hi;
    for (let i = 0; i < BISECTIONS; i++) {
        const mid = (a + b) / 2;
        if (f(mid) < target) {
            a = mid;
        } else {
            b = mid;
        }
    }
    return b;
}

/**
 * Design §5.3 step 2: the default backswing, its intensity and its planned speed. The intensity follows the
 * nearest-speed rule: 0 when even intensity 0 reaches CANONICAL_SPEED at the bound, 1 when even intensity 1 stays at or
 * below it. That departs from spec §5.3's "1 when unreachable" by user decision (2026-10-07).
 */
function chooseDefault(c: Case, shape: SwingShape, h0: number) {
    const range = swingReference[c.type].backswingRange;
    if (range === null || (h0 >= range.low.value && h0 <= range.high.value)) {
        return { backswing: h0, intensity: 0, speed: speed(c, shape, h0, 0), atBound: false };
    }
    const bound = h0 < range.low.value ? range.low.value : range.high.value;
    const at = (intensity: number): number => speed(c, shape, bound, intensity);
    let intensity: number;
    if (at(0) >= CANONICAL_SPEED) {
        intensity = 0;
    } else if (at(1) <= CANONICAL_SPEED) {
        intensity = 1;
    } else {
        intensity = solve(at, CANONICAL_SPEED, 0, 1);
    }
    return { backswing: bound, intensity, speed: at(intensity), atBound: true };
}

/** The planned speeds at `h0` for PROBE_INTENSITIES; throws naming the stroke type unless they strictly rise. */
function checkMonotone(c: Case, shape: SwingShape, h0: number): readonly number[] {
    const speeds = PROBE_INTENSITIES.map((intensity) => speed(c, shape, h0, intensity));
    for (let i = 1; i < speeds.length; i++) {
        if (!((speeds[i] as number) > (speeds[i - 1] as number))) {
            throw new Error(
                `${c.type}: the planned speed does not rise strictly with intensity at h0 = ${h0} m ` +
                    `(${speeds.join(", ")} m/s at ${PROBE_INTENSITIES.join(", ")})`,
            );
        }
    }
    return speeds;
}

function entry(value: number, unit: string, note: string, placeholder: boolean, bounds?: readonly [number, number]) {
    return {
        value,
        unit,
        ...(bounds === undefined ? {} : { bounds }),
        source: FIT_SOURCE,
        provenance: "derived",
        ...(placeholder ? { provisional: "placeholder" } : {}),
        note,
    };
}

const paired = SWING_REFERENCE_TYPES.filter((type) => swingReference[type].kinematics.length > 0);
if (paired.length > 0) {
    throw new Error(`kinematic pairs found for ${paired.join(", ")}: fitting to them needs a decision (Task 4 Step 2)`);
}

const out = JSON.parse(JSON.stringify(swingJson)) as Record<string, Record<string, unknown>>;
const fmt = (x: number, digits = 4): string => x.toFixed(digits);
let singleBallFall = NaN;
for (const type of SWING_REFERENCE_TYPES) {
    const c = caseOf(type);
    const record = out[type] as Record<string, unknown>;
    let shape = c.shape;
    let h0: number;
    if (c.mode === "swing") {
        h0 = solve((h) => speed(c, shape, h, 0), CANONICAL_SPEED, 0, maxBackswing(c));
        const fall = 0 - plan(c, shape, h0, 0).downswing.release;
        if (type === "single-ball") {
            singleBallFall = fall;
        }
        const pulse = { tempoSlow: fall, tempoFast: fall / 2 };
        const at = (torqueMax: number): number => speed(c, { ...shape, effort: { ...pulse, torqueMax } }, h0, 1);
        let hi = 1;
        while (at(hi) < SPEED_FACTOR * CANONICAL_SPEED) {
            hi *= 2;
        }
        const torqueMax = solve(at, SPEED_FACTOR * CANONICAL_SPEED, 0, hi);
        shape = { ...shape, effort: { ...pulse, torqueMax }, handTempo: { slow: fall, fast: fall / 2 } };
        const rule =
            `Placeholder (design §6.2): no kinematic pairs were sourced. h0 = ${fmt(h0)} m gives ` +
            `${CANONICAL_SPEED} m/s at intensity 0 in ${fmt(fall)} s`;
        const doubled = `${rule}; intensity 1 from h0 gives ${SPEED_FACTOR * CANONICAL_SPEED} m/s.`;
        record.torqueMax = entry(torqueMax, "N·m", doubled, true);
        record.tempoSlow = entry(fall, "s", `${rule}: the gravity-only fall time.`, true);
        record.tempoFast = entry(fall / 2, "s", `${rule}: half the gravity-only fall time.`, true);
    } else {
        const given = record.handTempoSlow as { source?: string; value?: number } | undefined;
        const sourced = given !== undefined && given.source !== FIT_SOURCE ? (given.value as number) : null;
        const slow = sourced ?? singleBallFall;
        const effort = { torqueMax: 0, tempoSlow: slow, tempoFast: slow / 2 };
        shape = { ...shape, handTempo: { slow, fast: slow / 2 }, effort };
        h0 = solve((h) => speed(c, shape, h, 0), CANONICAL_SPEED, 0, maxBackswing(c));
        if (sourced === null) {
            const note =
                'Placeholder (plan, "Decisions made while planning"): no roll tempo was sourced, so the ' +
                "single-ball stroke's gravity-only fall time from its h0.";
            record.handTempoSlow = entry(slow, "s", note, true);
        }
        const half = "Half handTempoSlow, so intensity 1 doubles the speed (design §6.2).";
        record.handTempoFast = entry(slow / 2, "s", half, sourced === null);
    }
    const probed = checkMonotone(c, shape, h0);
    const chosen = chooseDefault(c, shape, h0);
    const why = chosen.atBound
        ? `h0 = ${fmt(h0)} m lies outside the sourced range, so its nearest bound, at the intensity whose speed is ` +
          `nearest ${CANONICAL_SPEED} m/s`
        : `h0 = ${fmt(h0)} m, the backswing that gives ${CANONICAL_SPEED} m/s at intensity 0`;
    record.defaultBackswing = entry(chosen.backswing, "m", `Design §5.3: ${why}.`, false);
    record.defaultIntensity = entry(chosen.intensity, "1", `Design §5.3: ${why}.`, false, [0, 1]);
    const planned = "The planned contact speed at the default backswing and intensity.";
    record.defaultSpeed = entry(chosen.speed, "m/s", planned, false);
    console.error(
        `${type.padEnd(11)} h0 ${fmt(h0)} m; default ${fmt(chosen.backswing)} m at intensity ` +
            `${fmt(chosen.intensity, 3)}, ${fmt(chosen.speed)} m/s; ` +
            (c.mode === "swing"
                ? `fall ${fmt(shape.effort.tempoSlow)} s, torqueMax ${fmt(shape.effort.torqueMax)} N·m`
                : `hands' tempo ${fmt(shape.handTempo.slow)} s`),
    );
    const shown = probed.map((s) => fmt(s)).join(", ");
    console.error(`${" ".repeat(11)} speed at h0 for intensity ${PROBE_INTENSITIES.join(", ")}: ${shown} m/s`);
}
console.log(JSON.stringify(out, null, 4));
