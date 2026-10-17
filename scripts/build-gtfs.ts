/**
 * Builds data/<line>.stations.json and data/<line>.trips.json from PTV's GTFS Schedule zip.
 *
 *   npm run gtfs -- [path-or-url-to-gtfs.zip]
 *
 * The outer zip holds one google_transit.zip per mode; Metro trains are in folder 2.
 * Re-run when the timetable changes and commit the output.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import { parse } from "csv-parse/sync";
import type { Direction, LineConfig, LineData } from "../shared/types";
import hurstbridge from "../lines/hurstbridge.json";

const DEFAULT_SOURCE = "https://data.ptv.vic.gov.au/downloads/gtfs.zip";
const MODE_FOLDER: Record<LineConfig["mode"], string> = { "metro-train": "2", tram: "3" };
const LINES = [hurstbridge as LineConfig];

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

function buildLine(line: LineConfig, files: Record<string, Uint8Array>) {
  const stops = csv(files, "stops.txt");
  const stations: LineData["stations"] = {};
  const stationOfStop = new Map<string, string>();

  for (const station of line.stations) {
    const named = stops.filter((s) => stationName(s.stop_name) === station.name.toLowerCase());
    const parent = named.find((s) => s.location_type === "1");
    const members = parent ? stops.filter((s) => s.parent_station === parent.stop_id) : named;
    if (!parent && members.length === 0) throw new Error(`No GTFS stop found for ${station.name}`);
    const anchor = parent ?? members[0];
    const platforms: Record<string, string> = {};
    for (const m of members) if (m.platform_code) platforms[m.stop_id] = m.platform_code;
    const stopIds = [...new Set([...(parent ? [parent.stop_id] : []), ...members.map((m) => m.stop_id)])];
    stopIds.forEach((id) => stationOfStop.set(id, station.id));
    stations[station.id] = { lat: Number(anchor.stop_lat), lon: Number(anchor.stop_lon), stopIds, platforms };
    console.log(`${station.name}: ${stopIds.length} stop ids, platforms ${JSON.stringify(Object.values(platforms))}`);
  }

  const routeCode = line.routeIdMatch.replace(/[^A-Za-z0-9]/g, "");
  const routeIds = new Set(
    csv(files, "routes.txt")
      .filter((r) => r.route_id.includes(routeCode) || r.route_short_name === line.name)
      .map((r) => r.route_id),
  );
  const tripIds = new Set(csv(files, "trips.txt").filter((t) => routeIds.has(t.route_id)).map((t) => t.trip_id));
  console.log(`Routes ${[...routeIds].join(", ")}: ${tripIds.size} trips`);

  // stop_times.txt is large, so scan it line by line instead of parsing it all.
  const ends = new Map<string, { first: [number, string]; last: [number, string] }>();
  const text = strFromU8(files["stop_times.txt"]);
  const header = text.slice(0, text.indexOf("\n")).replace(/^﻿/, "").trim().split(",");
  const [ti, si, qi] = ["trip_id", "stop_id", "stop_sequence"].map((c) => header.indexOf(c));
  for (const row of text.split("\n")) {
    const cols = row.split(",");
    const tripId = cols[ti]?.replace(/"/g, "");
    if (!tripId || !tripIds.has(tripId)) continue;
    const seq = Number(cols[qi]?.replace(/"/g, ""));
    const stop = cols[si].replace(/"/g, "");
    const e = ends.get(tripId);
    if (!e) ends.set(tripId, { first: [seq, stop], last: [seq, stop] });
    else {
      if (seq < e.first[0]) e.first = [seq, stop];
      if (seq > e.last[0]) e.last = [seq, stop];
    }
  }

  const index = (stop: string) => line.stations.findIndex((s) => s.id === stationOfStop.get(stop));
  const trips: LineData["trips"] = {};
  for (const [tripId, { first, last }] of ends) {
    const a = index(first[1]);
    const b = index(last[1]);
    if (a < 0 || b < 0 || a === b) continue;
    const dir: Direction = b > a ? "outbound" : "citybound";
    trips[tripId] = { dir, dest: line.stations[b].id };
  }
  console.log(`${Object.keys(trips).length} trips with direction`);

  writeFileSync(
    `data/${line.id}.stations.json`,
    JSON.stringify({ generatedAt: new Date().toISOString(), stations }, null, 2) + "\n",
  );
  writeFileSync(`data/${line.id}.trips.json`, JSON.stringify(trips) + "\n");
}

const outer = unzipSync(await load(process.argv[2] ?? DEFAULT_SOURCE));
for (const line of LINES) {
  const inner = outer[`${MODE_FOLDER[line.mode]}/google_transit.zip`];
  if (!inner) throw new Error(`Folder ${MODE_FOLDER[line.mode]} missing; found ${Object.keys(outer).join(", ")}`);
  buildLine(line, unzipSync(inner));
}
