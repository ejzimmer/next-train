/**
 * Builds data/stations.json (every station on the map) and data/<line>.trips.json and .times.json
 * for each line from PTV's GTFS Schedule zip.
 *
 *   npm run gtfs -- [path-or-url-to-gtfs.zip]
 *
 * The outer zip holds one google_transit.zip per mode; Metro trains are in folder 2.
 * Re-run when the timetable changes and commit the output.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import { parse } from "csv-parse/sync";
import type { Direction, LineConfig, LineData, LineTimes } from "../shared/types";
import { LINES, STATIONS } from "../shared/network";

const DEFAULT_SOURCE = "https://data.ptv.vic.gov.au/downloads/gtfs.zip";
const MODE_FOLDER: Record<LineConfig["mode"], string> = { "metro-train": "2", tram: "3" };

type Row = Record<string, string>;

async function load(source: string): Promise<Uint8Array> {
  if (!/^https?:/.test(source)) return readFileSync(source);
  console.log(`Downloading ${source}`);
  const res = await fetch(source);
  if (!res.ok) throw new Error(`${source} returned ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

function csv(files: Record<string, Uint8Array>, name: string): Row[] {
  const file = files[name];
  if (!file) throw new Error(`${name} missing from feed`);
  return parse(strFromU8(file), { columns: true, skip_empty_lines: true, bom: true });
}

/** "Flinders Street Railway Station (Melbourne City)" → "flinders street" */
function stationName(stopName: string): string {
  return stopName
    .replace(/\(.*\)/, "")
    .replace(/\s+(railway\s+)?station.*$/i, "")
    .trim()
    .toLowerCase();
}

type Files = Record<string, Uint8Array>;

function buildStations(files: Files) {
  const stops = csv(files, "stops.txt");
  const stations: LineData["stations"] = {};
  const stationOfStop = new Map<string, string>();

  for (const station of Object.values(STATIONS)) {
    const named = stops.filter((s) => stationName(s.stop_name) === (station.gtfsName ?? station.name).toLowerCase());
    const parent = named.find((s) => s.location_type === "1");
    // Platforms only: skip entrances (location_type 2) and rail replacement bus stops.
    const members = (parent ? stops.filter((s) => s.parent_station === parent.stop_id) : named).filter(
      (s) => (s.location_type ?? "") in { "": 1, "0": 1 } && !/replacement/i.test(s.stop_name),
    );
    if (!parent && members.length === 0) throw new Error(`No GTFS stop found for ${station.name}`);
    const anchor = parent ?? members[0];
    const platforms: Record<string, string> = {};
    for (const m of members) if (m.platform_code) platforms[m.stop_id] = m.platform_code;
    const stopIds = [...new Set([...(parent ? [parent.stop_id] : []), ...members.map((m) => m.stop_id)])];
    stopIds.forEach((id) => stationOfStop.set(id, station.id));
    stations[station.id] = { lat: Number(anchor.stop_lat), lon: Number(anchor.stop_lon), stopIds, platforms };
  }
  console.log(`${Object.keys(stations).length} stations`);
  writeFileSync("data/stations.json", JSON.stringify({ generatedAt: new Date().toISOString(), stations }) + "\n");
  return { stops, stationOfStop };
}

function buildLine(line: LineConfig, files: Files, stops: Row[], allStationOfStop: Map<string, string>, stopTimes: string[][], header: string[]) {
  // Only this line's stations count as being on the line.
  const onLine = new Set(line.stations.map((s) => s.id));
  const stationOfStop = new Map([...allStationOfStop].filter(([, id]) => onLine.has(id)));

  const routes = csv(files, "routes.txt").filter((r) => r.route_id.includes(line.routeIdMatch));
  const routeIds = new Set(routes.map((r) => r.route_id));
  const tripIds = new Set(csv(files, "trips.txt").filter((t) => routeIds.has(t.route_id)).map((t) => t.trip_id));
  console.log(`Routes ${[...routeIds].join(", ")}: ${tripIds.size} trips`);

  // For each trip: its last stop, and its first and last stops on our line.
  type End = [seq: number, stop: string];
  const ends = new Map<string, { last: End; firstOn?: End; lastOn?: End }>();
  // Scheduled departure (seconds after midnight) at each of a trip's stops on our line.
  const schedule = new Map<string, [seq: number, stop: string, time: number][]>();
  const [ti, si, qi, ai, di] = ["trip_id", "stop_id", "stop_sequence", "arrival_time", "departure_time"].map((c) =>
    header.indexOf(c),
  );
  const seconds = (hms: string) => hms.split(":").reduce((t, part) => t * 60 + Number(part), 0);
  for (const cols of stopTimes) {
    const tripId = cols[ti]?.replace(/"/g, "");
    if (!tripId || !tripIds.has(tripId)) continue;
    const end: End = [Number(cols[qi]?.replace(/"/g, "")), cols[si].replace(/"/g, "")];
    const e = ends.get(tripId) ?? { last: end };
    ends.set(tripId, e);
    if (end[0] > e.last[0]) e.last = end;
    if (stationOfStop.has(end[1])) {
      if (!e.firstOn || end[0] < e.firstOn[0]) e.firstOn = end;
      if (!e.lastOn || end[0] > e.lastOn[0]) e.lastOn = end;
      const time = (cols[di] || cols[ai])?.replace(/"/g, "");
      if (time) schedule.set(tripId, [...(schedule.get(tripId) ?? []), [...end, seconds(time)]]);
    }
  }

  const stopName = new Map(stops.map((s) => [s.stop_id, s.stop_name]));
  const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
  const index = (stop: string) => line.stations.findIndex((s) => s.id === stationOfStop.get(stop));
  const trips: LineData["trips"] = {};
  for (const [tripId, { last, firstOn, lastOn }] of ends) {
    if (!firstOn || !lastOn) continue;
    const a = index(firstOn[1]);
    const b = index(lastOn[1]);
    if (a === b) continue;
    const dir: Direction = b > a ? "outbound" : "citybound";
    // Trains that leave our line terminate somewhere we don't draw: keep the terminus name.
    const dest = stationOfStop.get(last[1]) ?? titleCase(stationName(stopName.get(last[1]) ?? ""));
    trips[tripId] = { dir, dest };
  }
  console.log(`${Object.keys(trips).length} trips with direction`);

  writeFileSync(`data/${line.id}.trips.json`, JSON.stringify(trips) + "\n");

  // Many trips share a stopping pattern and running times, so store each pattern once
  // (times relative to the first stop) and give each trip its pattern and start time.
  const times: LineTimes = { patterns: [], trips: {} };
  const patternIndex = new Map<string, number>();
  for (const [tripId, stopsOn] of schedule) {
    if (!trips[tripId]) continue;
    stopsOn.sort((a, b) => a[0] - b[0]);
    const start = stopsOn[0][2];
    const pattern = stopsOn.map(([seq, stop, time]): [number, string, number] => [seq, stop, time - start]);
    const key = JSON.stringify(pattern);
    if (!patternIndex.has(key)) patternIndex.set(key, times.patterns.push(pattern) - 1);
    times.trips[tripId] = [patternIndex.get(key)!, start];
  }
  console.log(`${times.patterns.length} stopping patterns`);
  writeFileSync(`data/${line.id}.times.json`, JSON.stringify(times) + "\n");
}

const outer = unzipSync(await load(process.argv[2] ?? DEFAULT_SOURCE));
const folder = MODE_FOLDER["metro-train"];
const inner = outer[`${folder}/google_transit.zip`];
if (!inner) throw new Error(`Folder ${folder} missing; found ${Object.keys(outer).join(", ")}`);
const files = unzipSync(inner);
const { stops, stationOfStop } = buildStations(files);
// stop_times.txt is large, so split it into rows once instead of parsing it all.
const text = strFromU8(files["stop_times.txt"]);
const header = text.slice(0, text.indexOf("\n")).replace(/^\uFEFF/, "").trim().split(",");
const stopTimes = text.split("\n").map((row) => row.split(","));
for (const line of LINES) {
  console.log(`\n${line.name}`);
  buildLine(line, files, stops, stationOfStop, stopTimes, header);
}
