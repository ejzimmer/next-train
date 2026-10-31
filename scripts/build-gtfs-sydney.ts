/**
 * Builds data/sydney/stations.json (every station and light rail stop on the map) and data/sydney/lines.json
 * (each line's trips and timetable) from Transport for NSW's GTFS Schedule zips.
 *
 *   TFNSW_OPENDATA_KEY=... npm run gtfs:sydney
 *   npm run gtfs:sydney -- sydneytrains.zip innerwest.zip cbdandsoutheast.zip parramatta.zip
 *
 * The Sydney Trains timetable only runs about a month ahead, and its trip ids change with each version, so
 * this is re-run every week (.github/workflows/sydney-timetable.yml). Trips are kept for the next fortnight.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { unzipSync } from "fflate";
import type { Direction, LineConfig, LineData, LineTimes } from "../shared/types";
import { LINES, STATIONS } from "../shared/sydney";
import { csv, eachStopTime, load, type Files, type Row } from "./gtfs";

const API = "https://api.transport.nsw.gov.au/v1/gtfs/schedule";
const FEEDS = ["sydneytrains", "lightrail/innerwest", "lightrail/cbdandsoutheast", "lightrail/parramatta"];
/** Days of trips kept, from yesterday (trips running past midnight). */
const DAYS = 15;

const sources = process.argv.slice(2);
if (sources.length && sources.length !== FEEDS.length) throw new Error(`Give all ${FEEDS.length} zips, in the order ${FEEDS.join(", ")}`);
const key = process.env.TFNSW_OPENDATA_KEY;
if (!sources.length && !key) throw new Error("TFNSW_OPENDATA_KEY is not set");
const feeds: Files[] = [];
for (const [i, feed] of FEEDS.entries())
  feeds.push(unzipSync(await load(sources[i] ?? `${API}/${feed}`, { Authorization: `apikey ${key}` })));

const sydneyDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" });
/** YYYYMMDD in Sydney, `days` from now. */
const dateIn = (days: number) => sydneyDate.format(Date.now() + days * 86400_000).replace(/-/g, "");
const window = Array.from({ length: DAYS }, (_, i) => dateIn(i - 1));
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const weekday = (date: string) => WEEKDAYS[new Date(Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6))).getUTCDay()];

/** Service ids running on any day in the window, from calendar.txt and calendar_dates.txt. */
function runningServices(files: Files): Set<string> {
  const running = new Set<string>();
  const removed = new Set<string>();
  if (files["calendar_dates.txt"])
    for (const d of csv(files, "calendar_dates.txt")) {
      if (!window.includes(d.date)) continue;
      if (d.exception_type === "1") running.add(d.service_id);
      else removed.add(`${d.service_id}:${d.date}`);
    }
  if (files["calendar.txt"])
    for (const c of csv(files, "calendar.txt"))
      if (window.some((date) => c.start_date <= date && date <= c.end_date && c[weekday(date)] === "1" && !removed.has(`${c.service_id}:${date}`)))
        running.add(c.service_id);
  return running;
}

/**
 * Stations by GTFS stop: a station is the stop named "<name> Station" and its platforms; a light rail stop
 * (id lr-...) is every stop named "<name> Light Rail" and any platforms under it.
 */
function buildStations() {
  const stops = feeds.flatMap((files) => csv(files, "stops.txt"));
  const children = new Map<string, Row[]>();
  for (const s of stops) if (s.parent_station) children.set(s.parent_station, [...(children.get(s.parent_station) ?? []), s]);
  const stations: LineData["stations"] = {};
  const stationOfStop = new Map<string, string>();
  for (const station of Object.values(STATIONS)) {
    const lightRail = station.id.startsWith("lr-");
    const name = `${station.gtfsName ?? station.name} ${lightRail ? "Light Rail" : "Station"}`;
    const named = stops.filter((s) => s.stop_name === name && (lightRail || s.location_type === "1"));
    if (!named.length) throw new Error(`No GTFS stop found for ${name}`);
    const members = [...named, ...named.flatMap((s) => children.get(s.stop_id) ?? [])].filter(
      (s, i, all) => all.findIndex((x) => x.stop_id === s.stop_id) === i,
    );
    const platforms: Record<string, string> = {};
    for (const m of members) {
      const code = m.platform_code || /Platform (\S+)$/.exec(m.stop_name)?.[1];
      if (code && m.location_type !== "1") platforms[m.stop_id] = code;
    }
    const anchor = named.find((s) => s.location_type === "1") ?? named[0];
    stations[station.id] = { lat: Number(anchor.stop_lat), lon: Number(anchor.stop_lon), stopIds: members.map((m) => m.stop_id), platforms };
    for (const m of members) stationOfStop.set(m.stop_id, station.id);
  }
  console.log(`${Object.keys(stations).length} stations`);
  return { stations, stationOfStop };
}

/** Headsigns that don't say where the train's going. */
const NOT_DESTINATIONS = new Set(["Empty Train", "Does Not Pick Up", "Special"]);

/** One trip's stops in order: [stop_sequence, stop_id, time]. */
type Stops = [number, string, number | null][];

function buildLines(stationOfStop: Map<string, string>) {
  const routeLines = (routeId: string) => LINES.filter((l) => l.routeIdMatch.some((m) => routeId.includes(m)));
  // Every trip in the window on one of our lines, with its stops.
  const trips = new Map<string, { lines: LineConfig[]; headsign: string; stops: Stops }>();
  for (const files of feeds) {
    const running = runningServices(files);
    for (const t of csv(files, "trips.txt")) {
      const lines = routeLines(t.route_id);
      if (lines.length && running.has(t.service_id)) trips.set(t.trip_id, { lines, headsign: t.trip_headsign, stops: [] });
    }
    eachStopTime(files, (tripId, stopId, seq, time) => trips.get(tripId)?.stops.push([seq, stopId, time]));
  }

  const out: Record<string, { trips: LineData["trips"]; times: LineTimes }> = Object.fromEntries(
    LINES.map((l) => [l.id, { trips: {}, times: { patterns: [], trips: {} } }]),
  );
  const patternIndex = new Map<string, Map<string, number>>(LINES.map((l) => [l.id, new Map()]));
  const onLine = new Map(LINES.map((l) => [l.id, new Set(l.stations.map((s) => s.id))]));
  // Trips running somewhere their line isn't drawn (diversions during track work, mostly), by where.
  const partial = new Map<string, number>();
  for (const [tripId, trip] of trips) {
    trip.stops.sort((a, b) => a[0] - b[0]);
    const stations = trip.stops.map(([, stop]) => stationOfStop.get(stop));
    // A trip belongs to the branches that have the most of its stations (all of them, usually).
    const covered = (l: LineConfig) => stations.filter((s) => s && onLine.get(l.id)!.has(s)).length;
    const best = Math.max(...trip.lines.map(covered));
    if (best < 2) continue;
    if (best < stations.length) {
      const line = trip.lines.find((l) => covered(l) === best)!;
      const off = [...new Set(stations.filter((s) => !s || !onLine.get(line.id)!.has(s)))].join(", ");
      partial.set(`${line.name}: ${off}`, (partial.get(`${line.name}: ${off}`) ?? 0) + 1);
    }
    for (const line of trip.lines.filter((l) => covered(l) === best)) {
      const ids = new Set(onLine.get(line.id));
      const stops = trip.stops.filter(([, stop]) => ids.has(stationOfStop.get(stop) ?? ""));
      const index = (stop: string) => line.stations.findIndex((s) => s.id === stationOfStop.get(stop));
      const [a, b] = [index(stops[0][1]), index(stops[stops.length - 1][1])];
      // Round the City Circle a trip can start and end at Central: then its direction is the way it carries on.
      const dir: Direction = b > a || (a === b && index(stops[1][1]) > a) ? "outbound" : "citybound";
      const last = stationOfStop.get(stops[stops.length - 1][1]);
      // The headsign, as a station where it names one ("Central Station" is Central): ours, else one on the same mode.
      const named = NOT_DESTINATIONS.has(trip.headsign) ? "" : trip.headsign.replace(/ (Station|Light Rail)$/, "");
      const dest =
        line.stations.find((s) => s.name === named)?.id ??
        Object.values(STATIONS).find((s) => s.name === named && s.id.startsWith("lr-") === (line.mode === "light-rail"))?.id ??
        (named || last!);
      const { trips: lineTrips, times } = out[line.id];
      lineTrips[tripId] = { dir, dest };
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
  const offLine = [...partial].sort((a, b) => b[1] - a[1]);
  console.log(`${offLine.reduce((n, [, c]) => n + c, 0)} of ${trips.size} trips have stations off their line, most often:`);
  for (const [where, n] of offLine.slice(0, 8)) console.log(`  ${n} ${where}`);
  return out;
}

const { stations, stationOfStop } = buildStations();
const lines = buildLines(stationOfStop);
const generatedAt = new Date().toISOString();
mkdirSync("data/sydney", { recursive: true });
writeFileSync("data/sydney/stations.json", JSON.stringify({ generatedAt, stations }) + "\n");
writeFileSync("data/sydney/lines.json", JSON.stringify({ generatedAt, from: window[0], to: window[window.length - 1], lines }) + "\n");
