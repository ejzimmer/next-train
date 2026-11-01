import type { Config } from "@netlify/functions";
import { cityFeed } from "../../shared/feed";
import { cities, type Lines } from "../../shared/lines";
import { CACHE_HEADERS, cityOf, errorResponse } from "../../shared/http";
import { buildTrip } from "../../shared/trip";
import { scheduledTrip } from "../../shared/scheduledTrams";
import type { City } from "../../shared/types";

const platformStations = (lines: Lines) => new Set(Object.values(lines).flatMap(({ config }) => config.platformStations));
const PLATFORM_STATIONS = Object.fromEntries(Object.entries(cities).map(([city, lines]) => [city, platformStations(lines)])) as Record<
  City,
  Set<string>
>;

/** One trip's remaining stops (?id=trip id&line=line id&city=). */
export default async (req: Request) => {
  const params = new URL(req.url).searchParams;
  const id = params.get("id");
  const city = cityOf(req);
  const lines = city ? cities[city] : {};
  let line = lines[params.get("line") ?? ""];
  if (!id || !city || !line) return errorResponse(404, "Unknown trip");
  // A train drawn on a branch whose timetable doesn't have its trip: the branch that does.
  if (!(id in line.data.trips))
    line = Object.values(lines).find((l) => l.config.switchId === line.config.switchId && id in l.data.trips) ?? line;
  try {
    const feed = await cityFeed(city, "trips");
    const now = Date.now() / 1000;
    const trip =
      buildTrip(feed, id, line.config, line.data, PLATFORM_STATIONS[city], now) ??
      (line.config.mode === "tram" ? scheduledTrip(id, line.data, now) : null);
    if (!trip) return errorResponse(404, "Trip not running");
    return new Response(JSON.stringify(trip), { headers: CACHE_HEADERS });
  } catch (e) {
    return errorResponse(502, String(e));
  }
};

export const config: Config = { path: "/api/trip" };
