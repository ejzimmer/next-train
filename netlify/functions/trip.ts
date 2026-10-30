import type { Config } from "@netlify/functions";
import { fetchFeed } from "../../shared/feed";
import { lines } from "../../shared/lines";
import { apiKey, CACHE_HEADERS, errorResponse } from "../../shared/http";
import { buildTrip } from "../../shared/trip";

const PLATFORM_STATIONS = new Set(Object.values(lines).flatMap(({ config }) => config.platformStations));

/** One trip's remaining stops (?id=trip id&line=line id). */
export default async (req: Request) => {
  const params = new URL(req.url).searchParams;
  const id = params.get("id");
  const line = lines[params.get("line") ?? ""];
  if (!id || !line) return errorResponse(404, "Unknown trip");
  try {
    const feed = await fetchFeed("metro", "trip-updates", apiKey());
    const trip = buildTrip(feed, id, line.config, line.data, PLATFORM_STATIONS, Date.now() / 1000);
    if (!trip) return errorResponse(404, "Trip not running");
    return new Response(JSON.stringify(trip), { headers: CACHE_HEADERS });
  } catch (e) {
    return errorResponse(502, String(e));
  }
};

export const config: Config = { path: "/api/trip" };
