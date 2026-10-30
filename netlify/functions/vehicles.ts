import type { Config } from "@netlify/functions";
import { fetchFeed } from "../../shared/feed";
import { lines } from "../../shared/lines";
import { buildVehicles, startOf } from "../../shared/vehicles";
import { apiKey, CACHE_HEADERS, errorResponse } from "../../shared/http";
import type { VehicleDto, VehiclesResponse } from "../../shared/types";

/**
 * Every line's trains from one feed request; the page shows the lines that are switched on.
 * A train running through from one line to another (Sunbury to Pakenham, say) can be reported on both:
 * it's kept on the line of its newest report, or when both carry the same time, the later-starting trip.
 */
export default async () => {
  try {
    const feed = await fetchFeed("metro", "vehicle-positions", apiKey());
    const perLine = Object.values(lines).map(({ config, data }) => buildVehicles(feed, config, data));
    const body: VehiclesResponse = {
      feedTimestamp: perLine[0]?.feedTimestamp ?? 0,
      vehicles: newestPerTrain(perLine.flatMap((r) => r.vehicles)),
    };
    return new Response(JSON.stringify(body), { headers: CACHE_HEADERS });
  } catch (e) {
    return errorResponse(502, String(e));
  }
};

function newestPerTrain(vehicles: VehicleDto[]) {
  const byId = new Map<string, VehicleDto>();
  const start = (v: VehicleDto) => startOf(v.tripId, lines[v.line].data);
  for (const v of vehicles) {
    const kept = byId.get(v.id);
    const newer =
      !kept ||
      kept.timestamp < v.timestamp ||
      (kept.timestamp === v.timestamp && kept.tripId !== v.tripId && start(kept) < start(v));
    if (newer) byId.set(v.id, v);
  }
  return [...byId.values()];
}

export const config: Config = { path: "/api/vehicles" };
