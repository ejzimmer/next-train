import type { Config } from "@netlify/functions";
import { fetchFeed, toNum } from "../../shared/feed";
import { buildAlerts } from "../../shared/alerts";
import { lines } from "../../shared/lines";
import { apiKey, CACHE_HEADERS, errorResponse } from "../../shared/http";
import type { NetworkAlertsResponse } from "../../shared/types";

export default async () => {
  try {
    const feed = await fetchFeed("metro", "service-alerts", apiKey());
    const now = Date.now() / 1000;
    const body: NetworkAlertsResponse = {
      feedTimestamp: toNum(feed.header.timestamp),
      lines: Object.fromEntries(
        Object.values(lines).map(({ config, data }) => [config.id, buildAlerts(feed, config, data, now).alerts]),
      ),
    };
    return new Response(JSON.stringify(body), { headers: CACHE_HEADERS });
  } catch (e) {
    return errorResponse(502, String(e));
  }
};

export const config: Config = { path: "/api/alerts" };
