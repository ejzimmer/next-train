/**
 * Builds data/brisbane/stations.json (every station on the map) and data/brisbane/lines.json (each line's
 * trips and timetable) from Translink's South East Queensland GTFS Schedule zip.
 *
 *   npm run gtfs:brisbane
 *   npm run gtfs:brisbane -- SEQ_GTFS.zip
 *
 * Translink publishes a new timetable most weeks, with new trip ids, so this is re-run every week
 * (.github/workflows/brisbane-timetable.yml). Trips are kept for the next fortnight.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { unzipSync } from "fflate";
import type { Direction, LineConfig, LineData, LineTimes } from "../shared/types";
import { LINES, STATIONS } from "../shared/brisbane";
import { isLineRoute } from "../shared/routes";
import { TIME_ZONES } from "../shared/time";
import { csv, eachStopTime, load, type Files, type Row } from "./gtfs";

const SOURCE = "https://gtfsrt.api.translink.com.au/GTFS/SEQ_GTFS.zip";
/** Days of trips kept, from yesterday (trips running past midnight). */
const DAYS = 15;
/** GTFS route_type for trains. */
const RAIL = "2";

// Shapes are most of the zip and aren't needed.
const files: Files = unzipSync(await load(process.argv[2] ?? SOURCE), { filter: (f) => f.name !== "shapes.txt" });

const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONES.brisbane, year: "numeric", month: "2-digit", day: "2-digit" });
/** YYYYMMDD in Brisbane, `days` from now. */
const dateIn = (days: number) => localDate.format(Date.now() + days * 86400_000).replace(/-/g, "");
const window = Array.from({ length: DAYS }, (_, i) => dateIn(i - 1));
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const weekday = (date: string) => WEEKDAYS[new Date(Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6))).getUTCDay()];

/** Service ids running on any day in the window, from calendar.txt and calendar_dates.txt. */
function runningServices(): Set<string> {
  const running = new Set<string>();
  const removed = new Set<string>();
  for (const d of csv(files, "calendar_dates.txt")) {
    if (!window.includes(d.date)) continue;
    if (d.exception_type === "1") running.add(d.service_id);
    else removed.add(`${d.service_id}:${d.date}`);
  }
  for (const c of csv(files, "calendar.txt"))
    if (window.some((date) => c.start_date <= date && date <= c.end_date && c[weekday(date)] === "1" && !removed.has(`${c.service_id}:${date}`)))
      running.add(c.service_id);
  return running;
}

/** Stations by GTFS stop: each is the stop named "<name> station" and its platforms. */
function buildStations() {
  const stops = csv(files, "stops.txt");
  const children = new Map<string, Row[]>();
  for (const s of stops) if (s.parent_station) children.set(s.parent_station, [...(children.get(s.parent_station) ?? []), s]);
  const stations: LineData["stations"] = {};
  const stationOfStop = new Map<string, string>();
  for (const station of Object.values(STATIONS)) {
    const name = `${station.gtfsName ?? station.name} station`;
    const parent = stops.find((s) => s.stop_name === name && s.location_type === "1");
    if (!parent) throw new Error(`No GTFS stop found for ${name}`);
    const members = [parent, ...(children.get(parent.stop_id) ?? []).filter((s) => (s.location_type ?? "") in { "": 1, "0": 1 })];
    const platforms: Record<string, string> = {};
    for (const m of members) if (m.platform_code && m !== parent) platforms[m.stop_id] = m.platform_code;
    stations[station.id] = { lat: Number(parent.stop_lat), lon: Number(parent.stop_lon), stopIds: members.map((m) => m.stop_id), platforms };
    for (const m of members) stationOfStop.set(m.stop_id, station.id);
  }
  console.log(`${Object.keys(stations).length} stations`);
  return { stations, stationOfStop };
}

/** One trip's stops in order: [stop_sequence, stop_id, time]. */
type Stops = [number, string, number | null][];

/**
 * Most trains run through the city from one line to another (Ferny Grove to Beenleigh, say), so a trip is on
 * every line its route names that it calls at twice or more, with that line's part of the trip; except where
 * another of those lines has all of it there too (Beenleigh to Varsity Lakes is a Gold Coast train).
 */
function buildLines(stationOfStop: Map<string, string>) {
  const running = runningServices();
  const rail = new Set(csv(files, "routes.txt").filter((r) => r.route_type === RAIL).map((r) => r.route_id));
  const routeLines = new Map<string, LineConfig[]>();
  const trips = new Map<string, { lines: LineConfig[]; stops: Stops }>();
  for (const t of csv(files, "trips.txt")) {
    if (!rail.has(t.route_id) || !running.has(t.service_id)) continue;
    if (!routeLines.has(t.route_id)) routeLines.set(t.route_id, LINES.filter((l) => isLineRoute(t.route_id, l)));
    const lines = routeLines.get(t.route_id)!;
    if (lines.length) trips.set(t.trip_id, { lines, stops: [] });
  }
  eachStopTime(files, (tripId, stopId, seq, time) => trips.get(tripId)?.stops.push([seq, stopId, time]));

  const out: Record<string, { trips: LineData["trips"]; times: LineTimes }> = Object.fromEntries(
    LINES.map((l) => [l.id, { trips: {}, times: { patterns: [], trips: {} } }]),
  );
  const patternIndex = new Map<string, Map<string, number>>(LINES.map((l) => [l.id, new Map()]));
  const onLine = new Map(LINES.map((l) => [l.id, new Set(l.stations.map((s) => s.id))]));
  const unplaced = new Map<string, number>();
  for (const [tripId, trip] of trips) {
    trip.stops.sort((a, b) => a[0] - b[0]);
    const stations = trip.stops.map(([, stop]) => stationOfStop.get(stop));
    const covered = new Map(trip.lines.map((l) => [l, new Set(stations.filter((s): s is string => !!s && onLine.get(l.id)!.has(s)))]));
    const within = (a: Set<string>, b: Set<string>) => a.size < b.size && [...a].every((s) => b.has(s));
    const lines = trip.lines.filter((l) => covered.get(l)!.size >= 2 && !trip.lines.some((m) => within(covered.get(l)!, covered.get(m)!)));
    if (!lines.length) {
      const key = trip.lines.map((l) => l.name).join(", ");
      unplaced.set(key, (unplaced.get(key) ?? 0) + 1);
      continue;
    }
    const last = stations[stations.length - 1];
    for (const line of lines) {
      const ids = onLine.get(line.id)!;
      const stops = trip.stops.filter(([, stop]) => ids.has(stationOfStop.get(stop) ?? ""));
      const index = (stop: string) => line.stations.findIndex((s) => s.id === stationOfStop.get(stop));
      const dir: Direction = index(stops[stops.length - 1][1]) > index(stops[0][1]) ? "outbound" : "citybound";
      const { trips: lineTrips, times } = out[line.id];
      lineTrips[tripId] = { dir, dest: last ?? stationOfStop.get(stops[stops.length - 1][1])! };
      const timed = stops.filter(([, , time]) => time != null) as [number, string, number][];
      if (!timed.length) continue;
      const start = timed[0][2];
      const pattern = timed.map(([seq, stop, time]): [number, string, number] => [seq, stop, time - start]);
      const key = JSON.stringify(pattern);
      const patterns = patternIndex.get(line.id)!;
      if (!patterns.has(key)) patterns.set(key, times.patterns.push(pattern) - 1);
      times.trips[tripId] = [patterns.get(key)!, start];
    }
  }
  for (const line of LINES) console.log(`${line.name}: ${Object.keys(out[line.id].trips).length} trips, ${out[line.id].times.patterns.length} patterns`);
  for (const [lines, n] of unplaced) console.log(`  ${n} trips on ${lines} with under two stations on the map`);
  return out;
}

const { stations, stationOfStop } = buildStations();
const lines = buildLines(stationOfStop);
const generatedAt = new Date().toISOString();
mkdirSync("data/brisbane", { recursive: true });
writeFileSync("data/brisbane/stations.json", JSON.stringify({ generatedAt, stations }) + "\n");
writeFileSync("data/brisbane/lines.json", JSON.stringify({ generatedAt, from: window[0], to: window[window.length - 1], lines }) + "\n");
