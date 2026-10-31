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
  /** Shifts the label a few px from its usual place. */
  nudge?: [number, number];
  /** Bends in the line between the previous station and this one. */
  via?: [number, number][];
}

/** A line on the network map (shared/network.ts). Stations are listed city end first. */
export interface LineConfig {
  id: string;
  mode: "metro-train" | "tram";
  name: string;
  colour: string;
  /** Text colour on the line's colour. */
  textColour: string;
  /** Lines in the same group share a colour and are drawn as one where they share track. */
  group: string;
  /** Substring matched against GTFS-R route_id, e.g. "-HBE:" for aus:vic:vic-02-HBE: */
  routeIdMatch: string;
  /** First and last station of the City Loop section, skipped when trains run direct to Flinders Street. */
  cityLoop?: [string, string];
  /** Stations whose departures show a platform number. */
  platformStations: string[];
  stations: SchematicStation[];
  /** Track between stations that aren't next to each other in `stations`, e.g. direct to Flinders Street. */
  track: { from: string; to: string; via: [number, number][] }[];
}

/** Generated from GTFS static by scripts/build-gtfs.ts (data/*.json). */
export interface LineData {
  generatedAt: string;
  stations: Record<
    string,
    { lat: number; lon: number; stopIds: string[]; platforms: Record<string, string> }
  >;
  /** Static trips on this line: direction, and the terminating station id
   * (or the terminus name when it's off this line, e.g. a Stony Point train running on to the city). */
  trips: Record<string, { dir: Direction; dest: string }>;
  /** Scheduled times, for filling in stops the realtime feed leaves out. */
  times?: LineTimes;
}

export interface LineTimes {
  /** Stops on this line as [stop_sequence, stop_id, seconds after the trip's first stop here]. */
  patterns: [number, string, number][][];
  /** Each trip's pattern index and scheduled time at its first stop here (seconds after midnight). */
  trips: Record<string, [number, number]>;
}

export interface VehicleDto {
  id: string;
  tripId: string;
  /** The line's id. */
  line: string;
  /** Where this trip terminates from the static timetable (station id, or a name off the line); null if unknown. */
  destination: string | null;
  /** Unix seconds of the position report. */
  timestamp: number;
  direction: Direction | null;
  /** Index of the station segment start (0 = city end) and fraction towards the next station.
   * Segments past the last station are the line's extra `track`, in order. */
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
  /** The line's id. */
  line: string;
  platform: string | null;
  cancelled: boolean;
}

/** One trip's remaining stops (/api/trip). */
export interface TripDto {
  tripId: string;
  /** Station id, or a terminus name off the map. */
  destination: string | null;
  /** For trips ending at Flinders Street on a City Loop line: whether they get there round the Loop. */
  viaLoop: boolean | null;
  /** Seconds late (negative when early) at the next stop; null when the timetable doesn't know the trip. */
  delay: number | null;
  /** Stops still to come, the next one first. */
  stops: { station: string; time: number; platform: string | null }[];
}

export interface VehiclesResponse {
  feedTimestamp: number;
  vehicles: VehicleDto[];
}

export interface DeparturesResponse {
  feedTimestamp: number;
  stations: Record<string, DepartureDto[]>;
}

/** Departures from one station, on every line that stops there. */
export interface StationDeparturesResponse {
  feedTimestamp: number;
  departures: DepartureDto[];
}

export interface AlertDto {
  id: string;
  /** "buses": buses replace trains on `stretch`; "suspended": no trains on `stretch`, and no buses named;
   * "loop": trains run direct to Flinders Street, not via the City Loop; "delays": trains running late by up to `delay`. */
  kind: "buses" | "suspended" | "loop" | "delays" | "other";
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
  /** The stretch of line with no trains (city end first), for buses, suspensions and City Loop closures. */
  stretch: { from: string; to: string } | null;
  /** Minutes trains may be delayed by, when the alert says. */
  delay: number | null;
  /** Stations where some trains may start or end instead of running the whole line. */
  shortRuns: string[];
}

export interface AlertsResponse {
  feedTimestamp: number;
  alerts: AlertDto[];
}

/** Every line's alerts. The same alert can be on several lines, each with its own stretch. */
export interface NetworkAlertsResponse {
  feedTimestamp: number;
  lines: Record<string, AlertDto[]>;
}
