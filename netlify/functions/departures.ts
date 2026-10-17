import type { Config } from "@netlify/functions";
import { fetchFeed } from "../../shared/feed";
import { buildDepartures } from "../../shared/departures";
import { apiKey, CACHE_HEADERS, errorResponse, lineFromRequest } from "../../shared/http";

export default async (req: Request) => {
  const line = lineFromRequest(req);
  if (!line) return errorResponse(404, "Unknown line");
  try {
    const feed = await fetchFeed("metro", "trip-updates", apiKey());
    const body = buildDepartures(feed, line.config, line.data, Date.now() / 1000);
    return new Response(JSON.stringify(body), { headers: CACHE_HEADERS });
  } catch (e) {
    return errorResponse(502, String(e));
  }
};

export const config: Config = { path: "/api/departures" };
