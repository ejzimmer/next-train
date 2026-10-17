export type Direction = "citybound" | "outbound";

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
  stations: { id: string; name: string }[];
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
