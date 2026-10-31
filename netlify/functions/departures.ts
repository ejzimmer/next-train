import type { Config } from "@netlify/functions";
import { cityFeed, toNum } from "../../shared/feed";
import { buildDepartures } from "../../shared/departures";
import { cities } from "../../shared/lines";
import { CACHE_HEADERS, cityOf, errorResponse } from "../../shared/http";
import type { DepartureDto, StationDeparturesResponse } from "../../shared/types";

/** Departures from one station (?station=id&city=) on every line that stops there. */
export default async (req: Request) => {
  const station = new URL(req.url).searchParams.get("station");
  const city = cityOf(req);
  const serving = city ? Object.values(cities[city]).filter(({ config }) => config.stations.some((s) => s.id === station)) : [];
  if (!station || !city || !serving.length) return errorResponse(404, "Unknown station");
  try {
    const feed = await cityFeed(city, "trips");
    const now = Date.now() / 1000;
    // A trip on several branches of a line is listed once, from a branch whose timetable has it.
    const byTrip = new Map<string, DepartureDto[]>();
    const knows = new Map(serving.map(({ config, data }) => [config.id, data.trips]));
    for (const { config, data } of serving) {
      const here = new Map<string, DepartureDto[]>();
      for (const d of buildDepartures(feed, config, data, now).stations[station]) here.set(d.tripId, [...(here.get(d.tripId) ?? []), d]);
      for (const [tripId, deps] of here) {
        const kept = byTrip.get(tripId);
        if (!kept || (tripId in data.trips && !(tripId in knows.get(kept[0].line)!))) byTrip.set(tripId, deps);
      }
    }
    const body: StationDeparturesResponse = {
      feedTimestamp: toNum(feed.header.timestamp),
      departures: [...byTrip.values()].flat().sort((a, b) => a.time - b.time),
    };
    return new Response(JSON.stringify(body), { headers: CACHE_HEADERS });
  } catch (e) {
    return errorResponse(502, String(e));
  }
};

export const config: Config = { path: "/api/departures" };
