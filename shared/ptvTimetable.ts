/**
 * Live tram times from PTV's Timetable API (v3), for when the open-data tram feed has nothing. It gives each
 * tram's scheduled and estimated departure at a stop, not where the tram is, so each tram is placed where its
 * timetable puts it, shifted by how late it's running.
 *
 * Needs PTV_DEVID and PTV_API_KEY (from APIKeyRequest@ptv.vic.gov.au). Requests are signed: an HMAC-SHA1 of
 * the path and query (with the devid), keyed by the API key, as uppercase hex.
 */
import { createHmac } from "node:crypto";
import { serviceMidnight } from "./schedule";
import { dateFormat, TIME_ZONES } from "./time";
import type { TramTimetable } from "./trams";
import type { LineConfig, LineData } from "./types";

const BASE = "https://timetableapi.ptv.vic.gov.au";
const TRAM = 1;
/** Stops asked about along each route: every this many, and the last. A tram's next one is never far ahead. */
const EVERY = 6;

export interface Credentials {
  devid: string;
  key: string;
}

export function ptvCredentials(env: Record<string, string | undefined> = process.env): Credentials | null {
  const [devid, key] = [env.PTV_DEVID, env.PTV_API_KEY];
  return devid && key ? { devid, key } : null;
}

/** `path` (with its query) signed for the API. */
export function signedUrl(path: string, { devid, key }: Credentials): string {
  const withDev = `${path}${path.includes("?") ? "&" : "?"}devid=${encodeURIComponent(devid)}`;
  const signature = createHmac("sha1", key).update(withDev).digest("hex").toUpperCase();
  return `${BASE}${withDev}&signature=${signature}`;
}

type Fetch = (url: string) => Promise<Response>;

async function get<T>(path: string, creds: Credentials, fetcher: Fetch): Promise<T> {
  const res = await fetcher(signedUrl(path, creds));
  if (!res.ok) throw new Error(`PTV Timetable API ${res.status} for ${path.split("?")[0]}`);
  return (await res.json()) as T;
}

interface RoutesResponse {
  routes: { route_id: number; route_number: string; route_type: number }[];
}

export interface Departure {
  stop_id: number;
  route_id: number;
  run_ref: string;
  direction_id: number;
  scheduled_departure_utc: string;
  estimated_departure_utc: string | null;
}

export interface DeparturesResponse {
  departures: Departure[];
  runs?: Record<string, { vehicle_descriptor?: { id?: string | null } | null }>;
}

/** The API's route id for each tram route number; they don't change, so they're fetched once. */
let routeIds: Promise<Map<string, number>> | null = null;
function tramRouteIds(creds: Credentials, fetcher: Fetch) {
  routeIds ??= get<RoutesResponse>(`/v3/routes?route_types=${TRAM}`, creds, fetcher)
    .then((r) => new Map(r.routes.filter((x) => x.route_type === TRAM).map((x) => [x.route_number.trim(), x.route_id])))
    .catch((e) => {
      routeIds = null;
      throw e;
    });
  return routeIds;
}

/** The GTFS stop ids (one each side of the road) asked about along a route. */
export function timingStops(line: LineConfig, data: LineData): string[] {
  const n = line.stations.length;
  const picks = line.stations.filter((_, i) => i % EVERY === 0 || i === n - 1);
  return picks.flatMap((s) => data.stations[s.id]?.stopIds ?? []);
}

/** A tram running late (or early) by `delay` seconds, and its fleet number when the API gives it. */
export interface LiveTram {
  delay: number;
  fleet: string | null;
}

const localDate = dateFormat("en-CA", TIME_ZONES.melbourne, { year: "numeric", month: "2-digit", day: "2-digit" });
const serviceDate = (unix: number) => localDate.format(unix * 1000).replace(/-/g, "");

/**
 * Which timetable trip each departure is, by its stop and scheduled time, and how late it's running. Where a
 * trip has several, the soonest one ahead counts: it's the newest estimate.
 */
export function matchDepartures(
  route: string,
  departures: DeparturesResponse[],
  timetable: TramTimetable,
  now: number,
): Map<string, LiveTram> {
  const tt = timetable.routes[route];
  const out = new Map<string, LiveTram & { at: number }>();
  if (!tt) return out;
  const wanted = new Set(departures.flatMap((r) => r.departures.map((d) => String(d.stop_id))));
  // Each trip's time at the stops asked about, today's and last night's.
  const services = timetable.services.map((d) => new Set(d));
  const byStopTime = new Map<string, string>();
  for (const date of [serviceDate(now - 86_400), serviceDate(now)]) {
    const midnight = serviceMidnight(date)!;
    for (const [tripId, [p, start, service]] of Object.entries(tt.trips)) {
      if (!services[service]?.has(date)) continue;
      for (const [, stop, offset] of tt.patterns[p].stops)
        if (wanted.has(stop)) byStopTime.set(`${stop}|${midnight + start + offset}`, tripId);
    }
  }
  for (const r of departures)
    for (const d of r.departures) {
      if (!d.estimated_departure_utc) continue;
      const scheduled = Date.parse(d.scheduled_departure_utc) / 1000;
      const estimated = Date.parse(d.estimated_departure_utc) / 1000;
      if (!Number.isFinite(scheduled) || !Number.isFinite(estimated) || estimated < now - 60) continue;
      const tripId = [0, -60, 60].map((s) => byStopTime.get(`${d.stop_id}|${scheduled + s}`)).find(Boolean);
      if (!tripId) continue;
      const kept = out.get(tripId);
      if (kept && kept.at <= estimated) continue;
      const fleet = r.runs?.[d.run_ref]?.vehicle_descriptor?.id?.trim() || null;
      out.set(tripId, { delay: estimated - scheduled, fleet, at: estimated });
    }
  return new Map([...out].map(([id, { at: _, ...t }]) => [id, t]));
}

/**
 * How late each tram on the given routes is running, by timetable trip id. Routes the API has nothing for (or
 * fails on) are left out.
 */
export async function liveTrams(
  lines: { config: LineConfig; data: LineData }[],
  timetable: TramTimetable,
  now: number,
  creds: Credentials,
  fetcher: Fetch = fetch,
): Promise<Map<string, Map<string, LiveTram>>> {
  const ids = await tramRouteIds(creds, fetcher);
  const out = new Map<string, Map<string, LiveTram>>();
  await Promise.all(
    lines.map(async ({ config, data }) => {
      const route = config.id.replace(/^tram-/, "");
      const routeId = ids.get(route);
      if (routeId == null) return;
      const answers = await Promise.all(
        timingStops(config, data).map((stop) =>
          get<DeparturesResponse>(
            `/v3/departures/route_type/${TRAM}/stop/${stop}/route/${routeId}?max_results=4&expand=Run`,
            creds,
            fetcher,
          ).catch(() => null),
        ),
      );
      const ok = answers.filter((a): a is DeparturesResponse => !!a);
      if (ok.length) out.set(config.id, matchDepartures(route, ok, timetable, now));
    }),
  );
  return out;
}

/** For tests: forget the route ids. */
export function resetRouteIds() {
  routeIds = null;
}

