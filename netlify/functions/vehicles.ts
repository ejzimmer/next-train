import type { Config } from "@netlify/functions";
import { cityFeed } from "../../shared/feed";
import { cities, type Lines } from "../../shared/lines";
import { buildVehicles, startOf, type PlacedVehicle } from "../../shared/vehicles";
import { CACHE_HEADERS, cityOf, errorResponse } from "../../shared/http";
import type { VehicleDto, VehiclesResponse } from "../../shared/types";

/**
 * Every line's trains (?city=, Melbourne by default) from one feed request; the page shows the lines that are
 * switched on. A train running through from one line to another (Sunbury to Pakenham, say) can be reported on
 * both: it's kept on the line of its newest report, or when both carry the same time, the later-starting trip.
 */
export default async (req: Request) => {
  const city = cityOf(req);
  if (!city) return errorResponse(404, "Unknown city");
  try {
    const feed = await cityFeed(city, "vehicles");
    const lines = cities[city];
    const perLine = Object.values(lines).map(({ config, data }) => buildVehicles(feed, config, data));
    const body: VehiclesResponse = {
      feedTimestamp: perLine[0]?.feedTimestamp ?? 0,
      vehicles: newestPerTrain(perLine.flatMap((r) => r.vehicles), lines),
    };
    return new Response(JSON.stringify(body), { headers: CACHE_HEADERS });
  } catch (e) {
    return errorResponse(502, String(e));
  }
};

/**
 * One report per train. The same trip can also be placed on several lines (a Sydney line's branches share
 * track): it goes on a line whose timetable has the trip, and the one it's nearest. A trip off its own lines
 * (diverted, say) goes on another branch of the same line, if it's on one.
 */
function newestPerTrain(vehicles: PlacedVehicle[], lines: Lines): VehicleDto[] {
  const byId = new Map<string, PlacedVehicle>();
  const start = (v: VehicleDto) => startOf(v.tripId, lines[v.line].data);
  const owners = new Map<string, Set<string>>();
  for (const v of vehicles) if (v.known) owners.set(v.tripId, (owners.get(v.tripId) ?? new Set()).add(lines[v.line].config.switchId));
  // A trip some line knows only goes on that line's branches.
  const fits = (v: PlacedVehicle) => !owners.has(v.tripId) || owners.get(v.tripId)!.has(lines[v.line].config.switchId);
  for (const v of vehicles) {
    if (!fits(v)) continue;
    const kept = byId.get(v.id);
    const better =
      !kept ||
      kept.timestamp < v.timestamp ||
      (kept.timestamp === v.timestamp && kept.tripId !== v.tripId && start(kept) < start(v)) ||
      (kept.tripId === v.tripId && (Number(v.known) - Number(kept.known) || kept.offLine - v.offLine) > 0);
    if (better) byId.set(v.id, v);
  }
  return [...byId.values()].map(({ offLine: _, known: __, ...v }) => v);
}

export const config: Config = { path: "/api/vehicles" };
