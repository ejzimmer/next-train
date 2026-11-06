/**
 * Melbourne's buses, drawn only where they link the train stations and tram stops on lines that are showing
 * (scripts/build-gtfs-buses.ts builds the data).
 */

export interface BusLink {
  /** A train station or tram stop id, or "airport". */
  place: string;
  /** Metres along the route. */
  d: number;
}

export interface BusNetworkData {
  generatedAt: string;
  /** Places only buses go: Melbourne Airport. */
  places: Record<string, { name: string; lat: number; lon: number; x: number; y: number }>;
  routes: {
    /** The route number, or "skybus-sky" etc. */
    id: string;
    name: string;
    colour: string;
    textColour: string;
    skybus?: true;
    /** By GTFS direction; links in order along the route. */
    dirs: { dir: number; dest: string; length: number; links: BusLink[] }[];
  }[];
}

/** What only the functions need. */
export interface BusRoutesData {
  generatedAt: string;
  /** Each direction's stops as [lat, lon, metres along], to place a bus by where it is. */
  routes: Record<string, { dirs: { dir: number; pts: [number, number, number][] }[] }>;
  /** The days (YYYYMMDD) each SkyBus service runs; trips name theirs by index here. */
  services: string[][];
  /**
   * SkyBus by "route|dir": the main way's stops as [metres along, seconds after the first], and each trip's
   * start (seconds after midnight) and service.
   */
  skybus: Record<string, { times: [number, number][]; trips: [number, number][] }>;
}

/** A bus placed on its route. */
export interface BusDto {
  id: string;
  route: string;
  dir: number;
  /** Metres along the route. */
  d: number;
  /** Unix seconds of the report. */
  timestamp: number;
  /** Placed by the timetable (SkyBus), not a live report. */
  scheduled?: boolean;
}
