/**
 * Croquet-fit probe (P2b.2b.2c.2 design §3, §5; recorded, not gated): the croquet strokes' fit's figures, every run
 * through the fit's evaluator (scripts/ratioFit.ts) at today's values unless marked, its stroke planned at its speed
 * by strokeFor (each run's backswing, intensity and regime printed). Every figure to 4 decimals. Reports:
 * - A. the distance check (design §3): the CA's travel unit and where its ball speed was measured (CA_MEASURE); per CA
 *   single-ball drive A1D–A4D on the open lawn (scripts/openLawn.ts), the strike's share (planned at the CA's mallet
 *   speed: the model's ball speed at the face's release against the CA's, and their ratio) and the lawn's share
 *   (planned at releaseSpeedFor(the CA's ball speed): the travel to rest in metres against the CA's, and their ratio),
 *   A1D marked a very short stroke; then Gugan 5's drive on the drive preset at its target's speed on the open lawn:
 *   the croqueted ball's travel in yards against about seven.
 * Run with `npx --yes tsx scripts/croquetFitProbe.ts`; environment: SECTION (A; default all). Not part of the test
 * suite.
 */
import { horizontal, length, sub, type Vec3 } from "../src/engine/math/vec3";
import type { ShotSetup } from "../src/engine/swing/types";
import type { BallId, BallState, ShotResult } from "../src/engine/types";
import { ratioTargetsReference, swingReference } from "../src/reference/index";
import { OPEN_LAWN, OPEN_START, openWorld, opened } from "./openLawn";
import { CA_STROKES, TODAY, fitSetup, fitWorld, releaseSpeedFor, runFit } from "./ratioFit";

// The project has no Node types; this script runs under tsx and reads its environment.
declare const process: { readonly env: Readonly<Record<string, string | undefined>> };

const SECTION = process.env.SECTION ?? "all";
const fmt = (x: number): string => x.toFixed(4);
const runs = (section: string): boolean => SECTION === "all" || SECTION === section;

/** A yard (m). */
const YARD = 0.9144;

/** Gugan 5's drive: "about 3 m/s sending the croqueted ball about seven yards" (reference/sources/README.md:83-84). */
const GUGAN_DRIVE_YARDS = 7;

/**
 * The CA's travel unit and where its ball speed was measured, as reference/sources/README.md (P2b.2b.2c.2, Check 1)
 * records them.
 */
const CA_MEASURE = {
    unit: "m",
    unitLine:
        'README.md:491: "Unit: metres. Gugan 4, Table 2, row 1: \\"Total ball travel, L, m (from TEXT file)\\", ' +
        'values 0.93, 9.74 (A1D, A2D)"',
    pointLine:
        'README.md:494-495: "Measuring point: just after the impact ... \\"The values of speed in the tables are ' +
        'thus averages taken a few milliseconds *after* impact\\""',
};

/**
 * strokeFor's regime for `setup`'s stroke: 1 with no intensity (gravity only), 2 at the preset's defaultBackswing h_0
 * with an intensity, 3 at intensity 1 with the backswing solved beyond h_0.
 */
function regimeOf(setup: ShotSetup): 1 | 2 | 3 {
    const { type, backswing, intensity } = setup.stroke;
    if (intensity === undefined) {
        return 1;
    }
    return backswing === swingReference[type].defaultBackswing.value ? 2 : 3;
}

/** `setup`'s stroke inputs: its backswing, its intensity (or none) and strokeFor's regime. */
function strokeText(setup: ShotSetup): string {
    const { backswing, intensity } = setup.stroke;
    const effort = intensity === undefined ? "no intensity" : `intensity ${fmt(intensity)}`;
    return `backswing ${fmt(backswing)} m, ${effort} (regime ${regimeOf(setup)})`;
}

/** Ball `id`'s travel (m) on the turf from `setup`'s start to its rest in `motion`. */
function travel(setup: ShotSetup, motion: ShotResult, id: BallId): number {
    const start = (setup.balls[id] as BallState).position;
    return length(horizontal(sub(motion.rest[id] as Vec3, start)));
}

/** " (halted)" when phase 2 halted ball `id` past the open lawn's boundary: its distance is then not to rest. */
function haltedText(motion: ShotResult, id: BallId): string {
    return motion.events.some((e) => e.kind === "halted" && e.ball === id) ? " (halted)" : "";
}

function sectionA(): void {
    console.log(
        "== A. The distance check (design §3; recorded, not tuned): the CA's single-ball drives and Gugan 5's drive " +
            `on the open lawn (defaultWorld(10)'s surface, no hoops, a ${OPEN_LAWN} m square, the striker from ` +
            `(${fmt(OPEN_START.x)}, ${fmt(OPEN_START.y)}) m aiming +y), today's values; distances to rest ==`,
    );
    console.log(`the CA's travel unit: ${CA_MEASURE.unit} (${CA_MEASURE.unitLine})`);
    console.log(
        "the CA's ball speed: a few milliseconds after impact; the model's read at the face's release " +
            `(${CA_MEASURE.pointLine})`,
    );
    const world = fitWorld(TODAY, openWorld());
    const single = (speed: number): ShotSetup => opened(fitSetup("single-ball", TODAY, speed, world));
    for (const ca of CA_STROKES) {
        const short =
            ca.name === "A1D"
                ? " (a very short stroke: Hall's longer contacts apply, contact.json's faceBallContactTime note)"
                : "";
        console.log(
            `${ca.name}${short}: the CA's mallet ${fmt(ca.malletSpeed)} m/s, ball ${fmt(ca.ballSpeed)} m/s, travel ` +
                `${fmt(ca.travel)} ${CA_MEASURE.unit}`,
        );
        const struck = single(ca.malletSpeed);
        const strike = runFit(struck, TODAY, world);
        const released = length(strike.release.velocity);
        console.log(
            `  the strike's share: planned ${fmt(ca.malletSpeed)} m/s (${strokeText(struck)}): ball at the face's ` +
                `release ${fmt(released)} m/s against the CA's ${fmt(ca.ballSpeed)} m/s, ` +
                `×${fmt(released / ca.ballSpeed)}`,
        );
        const planned = releaseSpeedFor(ca.ballSpeed);
        const rolled = single(planned);
        const lawn = runFit(rolled, TODAY, world);
        const distance = travel(rolled, lawn.motion, rolled.striker);
        console.log(
            `  the lawn's share: planned ${fmt(planned)} m/s (${strokeText(rolled)}), ball at the face's release ` +
                `${fmt(length(lawn.release.velocity))} m/s: travel ${fmt(distance)} m` +
                `${haltedText(lawn.motion, rolled.striker)} against the CA's ${fmt(ca.travel)} ${CA_MEASURE.unit}, ` +
                `×${fmt(distance / ca.travel)}`,
        );
    }
    const speed = ratioTargetsReference.drive.speed.value;
    const drive = opened(fitSetup("drive", TODAY, speed, world));
    const motion = runFit(drive, TODAY, world).motion;
    const croqueted = drive.croqueted as BallId;
    const yards = travel(drive, motion, croqueted) / YARD;
    console.log(
        `Gugan 5's drive: planned ${fmt(speed)} m/s (${strokeText(drive)}): the croqueted ball ${fmt(yards)} yd` +
            `${haltedText(motion, croqueted)} against about ${GUGAN_DRIVE_YARDS} yd, ` +
            `×${fmt(yards / GUGAN_DRIVE_YARDS)}`,
    );
}

const SECTIONS: Readonly<Record<string, () => void>> = { A: sectionA };
if (SECTION !== "all" && SECTIONS[SECTION] === undefined) {
    throw new Error(`SECTION must be "all" or one of ${Object.keys(SECTIONS).join(", ")}`);
}
for (const [name, section] of Object.entries(SECTIONS)) {
    if (runs(name)) {
        section();
    }
}
