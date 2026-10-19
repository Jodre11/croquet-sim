/**
 * The stroke-shape fit (P2b.2b.2c.1 design §4.3–§4.5; plan decisions 11–14), on scripts/effortFit.ts:
 * 0. the body's backswing limit θ_max at knee height (design §5.2, gate ruling 4): the angle at which the default
 *    mallet's head rises KNEE_RISE (kneeLimit), written to body.backswingLimit with its derivation;
 * 1. the body's effort, a labelled placeholder: τ_0 and ω_max solved jointly (fitEffort) so that the weakest swing
 *    preset at intensity 1 from its body-limited top (θ_max, from step 0) reaches CEILING, and the
 *    drive's shaft there turns at κ·ω_max at contact, κ swing.json's body.effortShare; written to body.effortTorque
 *    and body.effortSpeed;
 * 2. every swing preset's U(i) checked over design §8.1.3's grid (checkCurve): strictly increasing in i, concave, and
 *    its slope at i = 1 at least END_SLOPE_SHARE of its mean; the fit throws naming the preset if not;
 * 3. unless KEEP_DEFAULTS=1, every swing preset's default (design §4.5): intensity DEFAULT_INTENSITY, a labelled
 *    placeholder (plan decision 13), and the backswing in (0, h_top] planning CANONICAL_SPEED at it (fitDefault); a
 *    sourced backswing range that excludes that backswing makes the fit throw, for the gate.
 * The swing presets' retired effort pulse (torqueMax, tempoSlow, tempoFast) is dropped. The carry presets are frozen at
 * engine 0.12.0's fit (design §4.4): their handTempoSlow, handTempoFast and defaultBackswing keep their values, their
 * notes saying so; nothing else of theirs is touched.
 * Never fitted to a ratio or to the user's play data. Prints reference/swing.json with its derived entries replaced to
 * stdout and a summary to stderr. Run with `[env KEEP_DEFAULTS=1] npx --yes tsx scripts/fitStrokeShape.ts > <file>`,
 * copy the file over reference/swing.json and run Prettier on it. Throws if any stroke type has kinematic pairs
 * (P2b.2b.2a plan Task 4 Step 2).
 */
import swingJson from "../reference/swing.json";
import { defaultProfile } from "../src/engine/swing/profile";
import { SWING_REFERENCE_TYPES, swingBodyReference, swingReference } from "../src/reference/index";
import {
    CANONICAL_SPEED,
    CEILING,
    END_SLOPE_SHARE,
    KNEE_RISE,
    SWING_PRESETS,
    bodyTop,
    checkCurve,
    contactArm,
    contactRate,
    fitDefault,
    fitEffort,
    kneeLimit,
    speedAt,
    weakestTop,
} from "./effortFit";

/** The proposed shared default intensity (plan decision 13): a labelled placeholder, a quarter of full effort. */
const DEFAULT_INTENSITY = 0.25;

/** The source every entry this fit derives cites. */
const FIT_SOURCE =
    "scripts/fitStrokeShape.ts: P2b.2b.2c.1 design §4.3–§4.5 " +
    "(docs/superpowers/specs/2026-10-18-p2b2b2c1-single-ball-design.md)";

/** The note appended to each frozen carry-preset entry. */
const FROZEN = "Frozen at engine 0.12.0's fit (P2b.2b.2c.1 design §4.4).";

/** The swing presets' retired effort pulse (P2b.2b.2a). */
const RETIRED: readonly string[] = ["torqueMax", "tempoSlow", "tempoFast"];

declare const process: { readonly env: Readonly<Record<string, string | undefined>> };

const KEEP_DEFAULTS = process.env.KEEP_DEFAULTS === "1";

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

const kappa = swingBodyReference.effortShare.value;
const limit = kneeLimit();
const profile = { ...defaultProfile, body: { ...defaultProfile.body, backswingLimit: limit } };
const fmt = (x: number, digits = 4): string => x.toFixed(digits);
const degrees = fmt((limit * 180) / Math.PI, 4);

const out = JSON.parse(JSON.stringify(swingJson)) as Record<string, Record<string, unknown>>;
const body = out.body as Record<string, unknown>;
const arm = contactArm("single-ball", profile);
const share = profile.shape["single-ball"].pendulumShare;
body.backswingLimit = {
    ...(body.backswingLimit as Record<string, unknown>),
    value: limit,
    source:
        "Spec §5.2 (docs/superpowers/specs/2026-10-18-p2b2b2c1-single-ball-design.md), the user's account of the " +
        "stance (2026-10-18) and the pre-flight gate's ruling 4 (2026-10-19); solved by scripts/fitStrokeShape.ts",
    note:
        `The shaft's greatest angle from vertical at the top of the backswing, at knee height: the angle at which ` +
        `the default mallet's head rises ${KNEE_RISE} m above its contact height ("about knee height", design ` +
        `§5.2), acos(cos θ_c − ${KNEE_RISE}·s/ℓ) on the single-ball preset's canonical contact (θ_c = ` +
        `${fmt((arm.thetaContact * 180) / Math.PI)}°, s = ${share}, ℓ = ${fmt(arm.lever, 6)} m), ${degrees}°. ` +
        "Bounds: 64° to 90°, the shaft horizontal.",
};

const effort = fitEffort(kappa, profile);
const weakest = weakestTop(effort, profile);
const rule =
    `τ_0 and ω_max solved jointly (design §4.4): the weakest swing preset, ${weakest.type}, reaches the ceiling ` +
    `${CEILING} m/s (1.1 × the CA's A4D 8.18 m/s, design §4.3) at intensity 1 from its body-limited top ` +
    `(θ_max = ${degrees}°), and the drive's shaft there turns at κ·ω_max at contact, κ = ${fmt(kappa)}.`;
body.effortTorque = entry(effort.torque, "N·m", `The isometric torque τ_0. ${rule}`, true);
body.effortSpeed = entry(effort.speed, "rad/s", `The speed ω_max at which the player adds no more. ${rule}`, true);

console.error(`τ_0 ${effort.torque} N·m; ω_max ${effort.speed} rad/s (κ ${kappa}, θ_max ${degrees}°)`);
for (const type of SWING_PRESETS) {
    const top = bodyTop(type, profile);
    const u1 = speedAt(type, top, 1, effort, profile);
    const u0 = speedAt(type, top, 0, effort, profile);
    const curve = checkCurve(type, effort, profile);
    console.error(
        `${type.padEnd(11)} top ${fmt(top)} m; U(1) ${fmt(u1, 6)} m/s; U(0) ${fmt(u0)}` +
            ` m/s; end slope ${fmt(curve.endSlope)} against mean ${fmt(curve.meanSlope)} m/s (worst backswing)`,
    );
    if (!curve.increasing || !curve.concave || !(curve.endSlope >= END_SLOPE_SHARE * curve.meanSlope)) {
        throw new Error(
            `${type}: U(i) fails design §4.2 over the §8.1.3 grid (increasing ${curve.increasing}, concave ` +
                `${curve.concave}, end slope ${curve.endSlope} against ${END_SLOPE_SHARE} × ${curve.meanSlope})`,
        );
    }
}
const driveRate = contactRate("drive", bodyTop("drive", profile), 1, effort, profile);
console.error(`drive κ·ω_max ${kappa * effort.speed} rad/s against ω at contact ${driveRate} rad/s`);

for (const type of SWING_REFERENCE_TYPES) {
    const given = out[type] as Record<string, unknown>;
    if (defaultProfile.drive[type].mode === "carry") {
        for (const key of ["handTempoSlow", "handTempoFast", "defaultBackswing"]) {
            const item = given[key] as { note?: string };
            if (!(item.note ?? "").endsWith(FROZEN)) {
                item.note = item.note === undefined ? FROZEN : `${item.note} ${FROZEN}`;
            }
        }
        continue;
    }
    const record = Object.fromEntries(Object.entries(given).filter(([key]) => !RETIRED.includes(key)));
    out[type] = record;
    if (KEEP_DEFAULTS) {
        continue;
    }
    const chosen = fitDefault(type, DEFAULT_INTENSITY, effort, profile);
    const range = swingReference[type].backswingRange;
    if (range !== null && !(chosen.backswing >= range.low.value && chosen.backswing <= range.high.value)) {
        throw new Error(
            `${type}: the default backswing ${chosen.backswing} m lies outside the sourced range ` +
                `[${range.low.value}, ${range.high.value}] m (plan decision 13)`,
        );
    }
    const why =
        `Design §4.5: the backswing planning ${CANONICAL_SPEED} m/s at the shared default intensity ` +
        `${DEFAULT_INTENSITY}, under the body's effort`;
    record.defaultBackswing = entry(chosen.backswing, "m", `${why}.`, false);
    record.defaultIntensity = entry(
        DEFAULT_INTENSITY,
        "1",
        "A labelled placeholder (P2b.2b.2c.1 plan decision 13): a quarter of full effort, the lightest round figure " +
            "plainly hands-assisted, shared by every swing preset.",
        true,
        [0, 1],
    );
    record.defaultSpeed = entry(
        chosen.speed,
        "m/s",
        "The planned contact speed at the default backswing and intensity.",
        false,
    );
    console.error(
        `${type.padEnd(11)} default ${fmt(chosen.backswing)} m at intensity ${DEFAULT_INTENSITY}, ` +
            `${fmt(chosen.speed)} m/s`,
    );
}
console.log(JSON.stringify(out, null, 4));
