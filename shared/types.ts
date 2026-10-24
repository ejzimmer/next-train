export type Direction = "citybound" | "outbound";

export interface SchematicStation {
  id: string;
  name: string;
  /** GTFS stop name without " Station", when it differs from name. */
  gtfsName?: string;
  /** Position on the schematic, and which side the label sits. */
  x: number;
  y: number;
  label: "t" | "b" | "l" | "r";
  /** Bends in the line between the previous station and this one. */
  via?: [number, number][];
}

/** Hand-written line config (lines/*.json). Stations are listed city end first. */
export interface LineConfig {
  id: string;
  mode: "metro-train" | "tram";
  name: string;
  colour: string;
  /** Substring matched against GTFS-R route_id, e.g. "-HBE:" for aus:vic:vic-02-HBE: */
  routeIdMatch: string;
  /** Other lines that share track with this one, from the city end up to and including `until` (a station id). */
  shared?: { name: string; routeIdMatch: string; until: string }[];
  /** First and last station of the City Loop section, skipped when trains run direct to Flinders Street. */
  cityLoop?: [string, string];
  /** Stations whose departures show a platform number. */
  platformStations: string[];
  /** Size of the schematic drawing in px, and any extra track drawn but not used for placing trains. */
  schematic: { width: number; height: number; loopClosure?: [number, number][] };
  stations: SchematicStation[];
}

/** Generated from GTFS static by scripts/build-gtfs.ts (data/*.json). */
export interface LineData {
  generatedAt: string;
  stations: Record<
    string,
    { lat: number; lon: number; stopIds: string[]; platforms: Record<string, string> }
  >;
  /** Static trips on this line and shared lines: direction, and the terminating station id
   * (or the terminus name when it's off this line, e.g. "Mernda"). */
  trips: Record<string, { dir: Direction; dest: string }>;
}

export interface VehicleDto {
  id: string;
  tripId: string;
  /** Name of the shared line this train is running on, or null for this line's own trains. */
  route: string | null;
  /** Where this trip terminates from the static timetable (station id, or a name off our line); null if unknown. */
  destination: string | null;
  /** Unix seconds of the position report. */
  timestamp: number;
  direction: Direction | null;
  /** Index of the station segment start (0 = city end) and fraction towards the next station. */
  segment: number;
  fraction: number;
  /** Inferred from the car numbers in the vehicle id; null when unrecognised. */
  trainType: string | null;
  cars: number;
}

export interface DepartureDto {
  tripId: string;
  /** Unix seconds. */
  time: number;
  direction: Direction | null;
  /** Station id on this line, or a terminus name off it. */
  destination: string | null;
  route: string | null;
  platform: string | null;
  cancelled: boolean;
}

export interface VehiclesResponse {
  feedTimestamp: number;
  vehicles: VehicleDto[];
}

export interface DeparturesResponse {
  feedTimestamp: number;
  stations: Record<string, DepartureDto[]>;
}

export interface AlertDto {
  id: string;
  /** "buses": buses replace trains on `stretch`; "loop": trains run direct to Flinders Street, not via the City Loop. */
  kind: "buses" | "loop" | "other";
  header: string;
  description: string;
  url: string | null;
  /** GTFS-R effect, e.g. REDUCED_SERVICE or MODIFIED_SERVICE. */
  effect: string;
  /** Unix seconds of the current or next period; null when open-ended. */
  start: number | null;
  end: number | null;
  /** Every period from now until a week ahead, for the calendar. */
  periods: { start: number | null; end: number | null }[];
  /** Station ids named in the alert, when it's about particular stations. */
  stations: string[];
  /** The stretch of line with no trains (city end first), for buses and City Loop closures. */
  stretch: { from: string; to: string } | null;
}

export interface AlertsResponse {
  feedTimestamp: number;
  alerts: AlertDto[];
}
