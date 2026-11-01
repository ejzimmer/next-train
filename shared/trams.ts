/**
 * Melbourne's tram routes, drawn on the train map. Unlike the trains, they aren't laid out by hand: the stops
 * are placed by scripts/build-gtfs-trams.ts (data/trams/network.json), bent to fit the schematic.
 */
import network from "../data/trams/network.json";
import type { Direction, LineConfig, SchematicStation } from "./types";

export interface TramNetworkData {
  generatedAt: string;
  /** Each stop (both sides of the road) by id, with where it is and where it's drawn. */
  stops: Record<string, { name: string; lat: number; lon: number; x: number; y: number }>;
  /** In route number order. `stops` run outbound (GTFS direction 0). */
  routes: { id: string; routeId: string; name: string; colour: string; textColour: string; stops: string[] }[];
  /** Bends in the drawn line between two neighbouring stops, keyed "from>to"; reversed when read "to>from". */
  bends: Record<string, [number, number][]>;
}

/** What only the functions need, kept out of the page. */
export interface TramTimetable {
  generatedAt: string;
  /** Each stop's GTFS stop ids, by stop id. */
  stopIds: Record<string, string[]>;
  /** By route number. */
  routes: Record<
    string,
    {
      /** Stops as [stop_sequence, stop_id, seconds after the first], with the way it runs and its headsign. */
      patterns: { dir: Direction; dest: string; stops: [number, string, number][] }[];
      /** Each trip's pattern and start (seconds after midnight). */
      trips: Record<string, [number, number]>;
    }
  >;
}

const data = network as unknown as TramNetworkData;

function bendsBetween(a: string, b: string): [number, number][] {
  return data.bends[`${a}>${b}`] ?? [...(data.bends[`${b}>${a}`] ?? [])].reverse();
}

export const TRAM_LINES: LineConfig[] = data.routes.map((r) => ({
  id: `tram-${r.id}`,
  city: "melbourne",
  mode: "tram",
  name: `Route ${r.id}`,
  switchId: `tram-${r.id}`,
  colour: r.colour,
  textColour: r.textColour,
  group: `tram-${r.id}`,
  routeIdMatch: [],
  // The feed's route ids may or may not carry the "aus:vic:vic-03-" prefix.
  routeIdPattern: `(^|-)${r.id}:?$`,
  alertRoutePattern: `(^|-)${r.id}:?$`,
  platformStations: [],
  stations: r.stops.map((id, i): SchematicStation => {
    const s = data.stops[id];
    const via = i > 0 ? bendsBetween(r.stops[i - 1], id) : [];
    return { id, name: s.name, x: s.x, y: s.y, label: "r", ...(via.length && { via }) };
  }),
  track: [],
}));

/** The route number on a tram line's button. */
export const routeNumber = (line: LineConfig) => line.id.replace(/^tram-/, "");

export const TRAM_STOPS: Record<string, Omit<SchematicStation, "via">> = Object.fromEntries(
  Object.entries(data.stops).map(([id, s]) => [id, { id, name: s.name, x: s.x, y: s.y, label: "r" as const }]),
);

/** Where each stop is, for the nearest stop. */
export const TRAM_PLACES: Record<string, { lat: number; lon: number }> = Object.fromEntries(
  Object.entries(data.stops).map(([id, s]) => [id, { lat: s.lat, lon: s.lon }]),
);
