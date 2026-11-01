import type { Config } from "@netlify/functions";
import { cityFeed, feedSummary } from "../../shared/feed";
import { cities, tramData, type Lines } from "../../shared/lines";
import { scheduledTrams } from "../../shared/scheduledTrams";
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
    if (new URL(req.url).searchParams.has("debug")) {
      const feed = await cityFeed(city, "vehicles");
      const placed = Object.values(cities[city]).map(({ config, data }) => [config.id, buildVehicles(feed, config, data).vehicles.length]);
      const body = {
        feeds: await feedSummary(city, "vehicles"),
        trips: await feedSummary(city, "trips"),
        alerts: (await feedSummary(city, "alerts")).map(({ feed, ...f }) => ({ feed, ...("error" in f ? f : { entities: f.entities }) })),
        placed: Object.fromEntries(placed),
      };
      return new Response(JSON.stringify(body, null, 1), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
    }
    const feed = await cityFeed(city, "vehicles");
    const lines = cities[city];
    const perLine = Object.values(lines).map(({ config, data }) => buildVehicles(feed, config, data));
    const vehicles = newestPerTrain(perLine.flatMap((r) => r.vehicles), lines);
    // A tram route the live feed has nothing on gets its trams from the timetable.
    const live = new Set(vehicles.map((v) => v.line));
    const now = Math.floor(Date.now() / 1000);
    for (const { config, data } of Object.values(lines))
      if (config.mode === "tram" && !live.has(config.id)) vehicles.push(...scheduledTrams(config, data, tramData, now));
    const body: VehiclesResponse = { feedTimestamp: perLine[0]?.feedTimestamp ?? 0, vehicles };
    return new Response(JSON.stringify(body), { headers: CACHE_HEADERS });
  } catch (e) {
    return errorResponse(502, String(e));
  }
};

/**
 * One report per train. The same trip can also be placed on several lines (a Sydney line's branches share
 * track): it goes on a line whose timetable has the trip, and the one it's nearest. A trip off its own lines
 * (diverted, say) goes on another branch of the same line, if it's on one.
 *
 * A trip running through from one switch's line to another's (a Brisbane train from Ferny Grove to Beenleigh)
 * is also listed on the other switch while it's on track the two share, after the best placement: the page
 * shows the first of a train's reports that's on a line switched on, so it isn't lost when that line is off.
 */
/** How much further (in metres) from another line a train can be and still be on track the two share. */
const SHARED_TRACK = 150;

function newestPerTrain(vehicles: PlacedVehicle[], lines: Lines): VehicleDto[] {
  const byId = new Map<string, PlacedVehicle>();
  const start = (v: VehicleDto) => startOf(v.tripId, lines[v.line].data);
  const owners = new Map<string, Set<string>>();
  for (const v of vehicles) if (v.known) owners.set(v.tripId, (owners.get(v.tripId) ?? new Set()).add(lines[v.line].config.switchId));
  // A trip some line knows only goes on that line's branches.
  const fits = (v: PlacedVehicle) => !owners.has(v.tripId) || owners.get(v.tripId)!.has(lines[v.line].config.switchId);
  const better = (v: PlacedVehicle, kept: PlacedVehicle | undefined) =>
    !kept ||
    kept.timestamp < v.timestamp ||
    (kept.timestamp === v.timestamp && kept.tripId !== v.tripId && start(kept) < start(v)) ||
    (kept.tripId === v.tripId && (Number(v.known) - Number(kept.known) || kept.offLine - v.offLine) > 0);
  const perSwitch = new Map<string, PlacedVehicle>();
  for (const v of vehicles) {
    if (!fits(v)) continue;
    if (better(v, byId.get(v.id))) byId.set(v.id, v);
    const key = `${v.id}|${lines[v.line].config.switchId}`;
    if (better(v, perSwitch.get(key))) perSwitch.set(key, v);
  }
  const out: PlacedVehicle[] = [];
  for (const best of byId.values()) {
    out.push(best);
    for (const [key, v] of perSwitch)
      if (v !== best && v.tripId === best.tripId && key.startsWith(`${best.id}|`) && v.known === best.known && v.offLine <= best.offLine + SHARED_TRACK)
        out.push(v);
  }
  return out.map(({ offLine: _, known: __, ...v }) => v);
}

export const config: Config = { path: "/api/vehicles" };
