/** The viewer's data, fetched from `public/viewer/` under the app's base (side-on viewer spec §3.3). */
import { readBandTable, type BandTable, type GripPlan } from "../lab/judge";
import type { MapType } from "../lab/index";
import type { DefaultEntry } from "./defaults";

const BASE = `${import.meta.env.BASE_URL}viewer/`;

async function fetched(name: string): Promise<Response> {
    const response = await fetch(`${BASE}${name}`);
    if (!response.ok) {
        throw new Error(`the viewer's ${name} did not load: ${response.status}`);
    }
    return response;
}

/** The defaults and the grip plans. */
export async function loadData(): Promise<{
    readonly defaults: readonly DefaultEntry[];
    readonly grips: readonly GripPlan[];
}> {
    const [defaults, grips] = await Promise.all([
        fetched("defaults.json").then((r) => r.json() as Promise<DefaultEntry[]>),
        fetched("grips.json").then((r) => r.json() as Promise<GripPlan[]>),
    ]);
    return { defaults, grips };
}

const tables = new Map<MapType, Promise<BandTable>>();

/** `type`'s band table, fetched once. */
export function loadTable(type: MapType): Promise<BandTable> {
    let table = tables.get(type);
    if (table === undefined) {
        table = fetched(`bands-${type}.bin`).then(async (r) => readBandTable(await r.arrayBuffer()));
        tables.set(type, table);
    }
    return table;
}
