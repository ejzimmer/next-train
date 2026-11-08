/**
 * Melbourne's buses, drawn only where they link the train stations and tram stops on lines that are showing
 * (scripts/build-gtfs-buses.ts builds the data).
 */

export interface BusLink {
  /** A train station or tram stop id. */
  place: string;
  /** Metres along the route. */
  d: number;
}

export interface BusNetworkData {
  generatedAt: string;
  routes: {
    /** The route number. */
    id: string;
    name: string;
    colour: string;
    textColour: string;
    /** By GTFS direction; links in order along the route. */
    dirs: { dir: number; dest: string; length: number; links: BusLink[] }[];
  }[];
}

/** What only the functions need. */
export interface BusRoutesData {
  generatedAt: string;
  /** Each direction's stops as [lat, lon, metres along], to place a bus by where it is. */
  routes: Record<string, { dirs: { dir: number; pts: [number, number, number][] }[] }>;
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
}
