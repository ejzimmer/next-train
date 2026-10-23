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
  /** Static trips on this line: direction and terminating station id. */
  trips: Record<string, { dir: Direction; dest: string }>;
}

export interface VehicleDto {
  id: string;
  tripId: string;
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
  destination: string | null;
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
