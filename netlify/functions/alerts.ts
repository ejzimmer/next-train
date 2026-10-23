import type { Config } from "@netlify/functions";
import { fetchFeed } from "../../shared/feed";
import { buildAlerts } from "../../shared/alerts";
import { apiKey, CACHE_HEADERS, errorResponse, lineFromRequest } from "../../shared/http";

export default async (req: Request) => {
  const line = lineFromRequest(req);
  if (!line) return errorResponse(404, "Unknown line");
  try {
    const feed = await fetchFeed("metro", "service-alerts", apiKey());
    return new Response(JSON.stringify(buildAlerts(feed, line.config, line.data, Date.now() / 1000)), {
      headers: CACHE_HEADERS,
    });
  } catch (e) {
    return errorResponse(502, String(e));
  }
};

export const config: Config = { path: "/api/alerts" };
