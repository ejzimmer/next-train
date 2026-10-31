import type { Config } from "@netlify/functions";
import { cityFeed, toNum } from "../../shared/feed";
import { buildAlerts } from "../../shared/alerts";
import { cities } from "../../shared/lines";
import { CACHE_HEADERS, cityOf, errorResponse } from "../../shared/http";
import type { NetworkAlertsResponse } from "../../shared/types";

/** Every line's alerts (?city=, Melbourne by default). */
export default async (req: Request) => {
  const city = cityOf(req);
  if (!city) return errorResponse(404, "Unknown city");
  try {
    const feed = await cityFeed(city, "alerts");
    const now = Date.now() / 1000;
    const body: NetworkAlertsResponse = {
      feedTimestamp: toNum(feed.header.timestamp),
      lines: Object.fromEntries(
        Object.values(cities[city]).map(({ config, data }) => [config.id, buildAlerts(feed, config, data, now).alerts]),
      ),
    };
    return new Response(JSON.stringify(body), { headers: CACHE_HEADERS });
  } catch (e) {
    return errorResponse(502, String(e));
  }
};

export const config: Config = { path: "/api/alerts" };
