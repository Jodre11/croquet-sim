/**
 * The lab: the map's play, browser-safe, outside the engine (side-on viewer spec §3.1). The viewer's entry point; the
 * scripts re-export it from their old places.
 */
export {
    MAP_TYPES,
    canonicalPower,
    labelOf,
    mapSetup,
    playJudged,
    playSample,
    textBook,
    type MapClass,
    type MapHold,
    type MapPlan,
    type MapSample,
    type MapType,
} from "./play";
export { searchFirmness } from "./firmness";
export { openWorld } from "./lawn";
