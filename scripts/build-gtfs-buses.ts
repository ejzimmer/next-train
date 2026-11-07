/**
 * Builds Melbourne's metro buses from PTV's GTFS Schedule zip (folder 4).
 *
 * Buses aren't drawn stop by stop. The page draws a bus route only as a thin line joining the train stations
 * and tram stops it passes (its links), and only the links on lines that are showing. So for each route and
 * direction this keeps:
 *
 * - data/buses/network.json (the page): each link (the station or tram stop, and how far along the route it
 *   is).
 * - data/buses/routes.json (the functions): the route's stops as [lat, lon, metres along], to place a live
 *   bus by its GPS position.
 *
 *   npm run gtfs:buses -- [path-or-url-to-gtfs.zip]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { unzipSync, Unzip, UnzipInflate } from "fflate";
import stations from "../data/stations.json";
import tramNetwork from "../data/trams/network.json";
import { STATIONS } from "../shared/network";
import type { BusNetworkData, BusRoutesData } from "../shared/buses";
import { csv, load, type Files } from "./gtfs";

const DEFAULT_SOURCE = "https://data.ptv.vic.gov.au/downloads/gtfs.zip";
const METRO_BUS = "4";
/** A bus stop this close (metres) to a train station or tram stop links to it. */
const NEAR_STATION = 250;
const NEAR_TRAM_STOP = 120;

type Place = { id: string; lat: number; lon: number; near: number };

const metres = (aLat: number, aLon: number, bLat: number, bLon: number) => {
  const x = (bLon - aLon) * 111_320 * Math.cos((aLat * Math.PI) / 180);
  const y = (bLat - aLat) * 110_570;
  return Math.hypot(x, y);
};

const places: Place[] = [
  ...Object.keys(STATIONS).flatMap((id) => {
    const s = (stations.stations as Record<string, { lat: number; lon: number }>)[id];
    return s ? [{ id, lat: s.lat, lon: s.lon, near: NEAR_STATION }] : [];
  }),
  ...Object.entries((tramNetwork as { stops: Record<string, { lat: number; lon: number }> }).stops).map(([id, s]) => ({
    id,
    lat: s.lat,
    lon: s.lon,
    near: NEAR_TRAM_STOP,
  })),
];

// Places bucketed by ~1 km square, so finding the ones near a stop is quick.
const cell = (lat: number, lon: number) => `${Math.floor(lat * 100)}|${Math.floor(lon * 80)}`;
const buckets = new Map<string, Place[]>();
for (const p of places) {
  const k = cell(p.lat, p.lon);
  buckets.set(k, [...(buckets.get(k) ?? []), p]);
}
function nearby(lat: number, lon: number): { id: string; m: number }[] {
  const [a, b] = [Math.floor(lat * 100), Math.floor(lon * 80)];
  const out: { id: string; m: number }[] = [];
  for (let i = -1; i <= 1; i++)
    for (let j = -1; j <= 1; j++)
      for (const p of buckets.get(`${a + i}|${b + j}`) ?? []) {
        const m = metres(lat, lon, p.lat, p.lon);
        if (m <= p.near) out.push({ id: p.id, m });
      }
  return out;
}

/** stop_times.txt is too big to hold as one string; this goes through it a chunk at a time. */
function eachStopTime(zip: Uint8Array, row: (tripId: string, stopId: string, seq: number, time: number | null) => void) {
  let rest = "";
  let header: string[] | null = null;
  let cols: number[] = [];
  const decoder = new TextDecoder();
  const seconds = (hms: string) => hms.split(":").reduce((t, part) => t * 60 + Number(part), 0);
  const unquote = (v: string | undefined) => (v ?? "").replace(/"/g, "").trim();
  const line = (l: string) => {
    const c = l.replace(/\r$/, "").split(",");
    if (!header) {
      header = c.map((h) => unquote(h).replace(/^﻿/, ""));
      cols = ["trip_id", "stop_id", "stop_sequence", "arrival_time", "departure_time"].map((n) => header!.indexOf(n));
      return;
    }
    const tripId = unquote(c[cols[0]]);
    if (!tripId) return;
    const time = unquote(c[cols[4]]) || unquote(c[cols[3]]);
    row(tripId, unquote(c[cols[1]]), Number(unquote(c[cols[2]])), time ? seconds(time) : null);
  };
  const unzip = new Unzip((file) => {
    if (file.name !== "stop_times.txt") return;
    file.ondata = (err, chunk, final) => {
      if (err) throw err;
      const text = rest + decoder.decode(chunk, { stream: !final });
      const lines = text.split("\n");
      rest = final ? "" : lines.pop()!;
      for (const l of lines) if (l) line(l);
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  unzip.push(zip, true);
}

function filesOf(zip: Uint8Array): Files {
  return unzipSync(zip, { filter: (f) => f.name !== "stop_times.txt" });
}

interface Pattern {
  stops: string[];
  count: number;
}

/** Each route's main way in each direction: the longest that a fair share of its trips take. */
function mainPatterns(zip: Uint8Array, files: Files) {
  const trips = csv(files, "trips.txt");
  const tripOf = new Map(trips.map((t) => [t.trip_id, t]));
  const stopsOf = new Map<string, [number, string, number][]>();
  eachStopTime(zip, (tripId, stopId, seq, time) => {
    if (time == null || !tripOf.has(tripId)) return;
    let list = stopsOf.get(tripId);
    if (!list) stopsOf.set(tripId, (list = []));
    list.push([seq, stopId, time]);
  });
  const patterns = new Map<string, Map<string, Pattern>>();
  for (const [tripId, list] of stopsOf) {
    list.sort((a, b) => a[0] - b[0]);
    const t = tripOf.get(tripId)!;
    const key = `${t.route_id}|${t.direction_id || "0"}`;
    const stops = list.map(([, s]) => s);
    const k = stops.join(">");
    const byRoute = patterns.get(key) ?? new Map<string, Pattern>();
    const p = byRoute.get(k) ?? { stops, count: 0 };
    p.count++;
    byRoute.set(k, p);
    patterns.set(key, byRoute);
  }
  const main = new Map<string, Pattern>();
  for (const [key, byRoute] of patterns) {
    const most = Math.max(...[...byRoute.values()].map((p) => p.count));
    const best = [...byRoute.values()]
      .filter((p) => p.count >= most / 10)
      .sort((a, b) => b.stops.length - a.stops.length || b.count - a.count)[0];
    if (best) main.set(key, best);
  }
  return main;
}

function build(zip: Uint8Array) {
  const network: BusNetworkData = { generatedAt: new Date().toISOString(), routes: [] };
  const routesData: BusRoutesData = { generatedAt: network.generatedAt, routes: {} };
  const files = filesOf(zip);
  const stops = new Map(csv(files, "stops.txt").map((s) => [s.stop_id, s]));
  const main = mainPatterns(zip, files);
  // Routes are listed once per operator; they share a number (and the first one's name and colour).
  const routes = new Map<string, Record<string, string>>();
  const ids = new Map<string, string>();
  for (const r of csv(files, "routes.txt")) {
    const id = r.route_short_name.trim();
    if (!id) continue;
    ids.set(r.route_id, id);
    if (!routes.has(id)) routes.set(id, r);
  }
  for (const [id, r] of routes) {
    const dirs: BusNetworkData["routes"][number]["dirs"] = [];
    const real: BusRoutesData["routes"][string]["dirs"] = [];
    for (const dir of ["0", "1"]) {
      // The operator whose way is longest.
      const p = [...ids]
        .filter(([, v]) => v === id)
        .map(([routeId]) => main.get(`${routeId}|${dir}`))
        .filter((x): x is Pattern => !!x)
        .sort((a, b) => b.stops.length - a.stops.length)[0];
      if (!p) continue;
      const pts: [number, number, number][] = [];
      let d = 0;
      for (const s of p.stops) {
        const stop = stops.get(s);
        if (!stop) continue;
        const [lat, lon] = [Number(stop.stop_lat), Number(stop.stop_lon)];
        if (pts.length) d += metres(pts[pts.length - 1][0], pts[pts.length - 1][1], lat, lon);
        pts.push([Math.round(lat * 1e5) / 1e5, Math.round(lon * 1e5) / 1e5, Math.round(d)]);
      }
      // Each place it passes, at the stop closest to it.
      const best = new Map<string, { m: number; d: number }>();
      for (const [lat, lon, at] of pts)
        for (const { id: place, m } of nearby(lat, lon)) {
          const b = best.get(place);
          if (!b || m < b.m) best.set(place, { m, d: at });
        }
      const links = [...best].sort((a, b) => a[1].d - b[1].d).map(([place, { d: at }]) => ({ place, d: at }));
      const lastStop = stops.get(p.stops[p.stops.length - 1]);
      dirs.push({ dir: Number(dir), dest: (lastStop?.stop_name ?? "").replace(/\s*\/.*$/, ""), length: Math.round(d), links });
      real.push({ dir: Number(dir), pts });
    }
    if (!dirs.some((x) => x.links.length >= 2)) continue;
    network.routes.push({
      id,
      name: r.route_long_name.replace(/\s+/g, " ").trim(),
      colour: `#${r.route_color || "FF8200"}`,
      textColour: `#${r.route_text_color || "FFFFFF"}`,
      dirs,
    });
    routesData.routes[id] = { dirs: real };
  }
  network.routes.sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
  mkdirSync("data/buses", { recursive: true });
  writeFileSync("data/buses/network.json", JSON.stringify(network) + "\n");
  writeFileSync("data/buses/routes.json", JSON.stringify(routesData) + "\n");
  console.log(`${routes.size} routes, ${network.routes.length} linking two or more places`);
}

const outer = unzipSync(await load(process.argv[2] ?? DEFAULT_SOURCE), {
  filter: (f) => f.name === `${METRO_BUS}/google_transit.zip`,
});
const metro = outer[`${METRO_BUS}/google_transit.zip`];
if (!metro) throw new Error(`Folder ${METRO_BUS} missing; found ${Object.keys(outer).join(", ")}`);
build(metro);
