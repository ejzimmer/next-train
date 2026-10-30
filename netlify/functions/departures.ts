import type { Config } from "@netlify/functions";
import { fetchFeed, toNum } from "../../shared/feed";
import { buildDepartures } from "../../shared/departures";
import { lines } from "../../shared/lines";
import { apiKey, CACHE_HEADERS, errorResponse } from "../../shared/http";
import type { StationDeparturesResponse } from "../../shared/types";

/** Departures from one station (?station=id) on every line that stops there. */
export default async (req: Request) => {
  const station = new URL(req.url).searchParams.get("station");
  const serving = Object.values(lines).filter(({ config }) => config.stations.some((s) => s.id === station));
  if (!station || !serving.length) return errorResponse(404, "Unknown station");
  try {
    const feed = await fetchFeed("metro", "trip-updates", apiKey());
    const now = Date.now() / 1000;
    const body: StationDeparturesResponse = {
      feedTimestamp: toNum(feed.header.timestamp),
      departures: serving
        .flatMap(({ config, data }) => buildDepartures(feed, config, data, now).stations[station])
        .sort((a, b) => a.time - b.time),
    };
    return new Response(JSON.stringify(body), { headers: CACHE_HEADERS });
  } catch (e) {
    return errorResponse(502, String(e));
  }
};

export const config: Config = { path: "/api/departures" };
