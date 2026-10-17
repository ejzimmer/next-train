import type { Config } from "@netlify/functions";
import { fetchFeed } from "../../shared/feed";
import { buildVehicles } from "../../shared/vehicles";
import { apiKey, CACHE_HEADERS, errorResponse, lineFromRequest } from "../../shared/http";

export default async (req: Request) => {
  const line = lineFromRequest(req);
  if (!line) return errorResponse(404, "Unknown line");
  try {
    const feed = await fetchFeed("metro", "vehicle-positions", apiKey());
    return new Response(JSON.stringify(buildVehicles(feed, line.config, line.data)), { headers: CACHE_HEADERS });
  } catch (e) {
    return errorResponse(502, String(e));
  }
};

export const config: Config = { path: "/api/vehicles" };
