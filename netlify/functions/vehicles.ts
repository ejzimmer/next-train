import type { Config } from "@netlify/functions";
import busRoutes from "../../data/buses/routes.json";
import type { BusDto, BusRoutesData } from "../../shared/buses";
import { liveBuses } from "../../shared/busVehicles";
import { cityFeed, feedSummary, melbourneBusFeed } from "../../shared/feed";
import { cities, tramData, type Lines } from "../../shared/lines";
import { liveTrams, ptvCredentials, type LiveTram } from "../../shared/ptvTimetable";
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
    const params = new URL(req.url).searchParams;
    if (params.has("debug")) {
      const feed = await cityFeed(city, "vehicles");
      const placed = Object.values(cities[city]).map(({ config, data }) => [config.id, buildVehicles(feed, config, data).vehicles.length]);
      const body = {
        feeds: await feedSummary(city, "vehicles"),
        trips: await feedSummary(city, "trips"),
        alerts: (await feedSummary(city, "alerts")).map(({ feed, ...f }) => ({ feed, ...("error" in f ? f : { entities: f.entities }) })),
        placed: Object.fromEntries(placed),
        timetableApi: await timetableApiSummary(city, params),
      };
      return new Response(JSON.stringify(body, null, 1), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
    }
    const feed = await cityFeed(city, "vehicles");
    const lines = cities[city];
    const perLine = Object.values(lines).map(({ config, data }) => buildVehicles(feed, config, data));
    const vehicles = newestPerTrain(perLine.flatMap((r) => r.vehicles), lines);
    // A tram route the live feed has nothing on gets its trams from the timetable, placed by how late each is
    // running where the Timetable API says (for the routes the page shows, ?trams=96,86).
    const live = new Set(vehicles.map((v) => v.line));
    const now = Math.floor(Date.now() / 1000);
    const missing = Object.values(lines).filter(({ config }) => config.mode === "tram" && !live.has(config.id));
    const delays = await tramDelays(missing, params, now);
    for (const { config, data } of missing) vehicles.push(...scheduledTrams(config, data, tramData, now, delays.get(config.id)));
    const buses = city === "melbourne" ? await busesOn(params) : undefined;
    const body: VehiclesResponse = { feedTimestamp: perLine[0]?.feedTimestamp ?? 0, vehicles, ...(buses && { buses }) };
    return new Response(JSON.stringify(body), { headers: CACHE_HEADERS });
  } catch (e) {
    return errorResponse(502, String(e));
  }
};

const BUS_ROUTES = busRoutes as unknown as BusRoutesData;

/** The buses on the routes the page draws (?buses=903,200); trains and trams still come if the bus feed fails. */
async function busesOn(params: URLSearchParams): Promise<BusDto[] | undefined> {
  const wanted = new Set((params.get("buses") ?? "").split(",").map((r) => r.trim()).filter(Boolean));
  if (!wanted.size) return undefined;
  try {
    return liveBuses(await melbourneBusFeed(), BUS_ROUTES.routes, wanted);
  } catch (e) {
    console.error("Bus feed:", e);
    return [];
  }
}

/** The tram routes the page shows (?trams=96,86), of those given. */
const shownTrams = (lines: Lines[string][], params: URLSearchParams) => {
  const shown = new Set((params.get("trams") ?? "").split(",").map((n) => `tram-${n.trim()}`));
  return lines.filter(({ config }) => shown.has(config.id));
};

async function tramDelays(lines: Lines[string][], params: URLSearchParams, now: number): Promise<Map<string, Map<string, LiveTram>>> {
  const creds = ptvCredentials();
  const shown = shownTrams(lines, params);
  if (!creds || !shown.length) return new Map();
  try {
    return await liveTrams(shown, tramData, now, creds);
  } catch (e) {
    console.error("Timetable API:", e);
    return new Map();
  }
}

/** For ?debug: whether the Timetable API is set up and how many trams it times on each route asked about. */
async function timetableApiSummary(city: string, params: URLSearchParams) {
  if (city !== "melbourne") return null;
  const creds = ptvCredentials();
  if (!creds) return { error: "PTV_DEVID and PTV_API_KEY not set" };
  const shown = shownTrams(Object.values(cities.melbourne), params);
  if (!shown.length) return { configured: true, note: "add &trams=96,86 to check routes" };
  try {
    const live = await liveTrams(shown, tramData, Math.floor(Date.now() / 1000), creds);
    return Object.fromEntries(shown.map(({ config }) => [config.id, live.get(config.id)?.size ?? "no answer"]));
  } catch (e) {
    return { error: String(e) };
  }
}

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
