/**
 * Builds Melbourne's tram routes from PTV's GTFS Schedule zip (folder 3 of the outer zip):
 *
 * - data/trams/network.json: each route's stops in order, and where each stop sits on the train map. Stops are
 *   placed by bending their real positions to fit the schematic (a thin-plate spline through the train
 *   stations' real and drawn positions), so trams run past the right stations.
 * - data/trams/timetable.json: each trip's stopping pattern and start time, and where it's headed.
 *
 *   npm run gtfs:trams -- [path-or-url-to-gtfs.zip]
 *
 * Trip ids change with each timetable, so this is rebuilt every week (.github/workflows/tram-timetable.yml).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { unzipSync } from "fflate";
import stations from "../data/stations.json";
import { STATIONS } from "../shared/network";
import type { TramNetworkData, TramTimetable } from "../shared/trams";
import { csv, eachStopTime, load, type Files } from "./gtfs";

const DEFAULT_SOURCE = "https://data.ptv.vic.gov.au/downloads/gtfs.zip";
const TRAM_FOLDER = "3";

type Pt = [number, number];

const flinders = stations.stations["flinders-street"];
/** Kilometres east and south of Flinders Street. */
const km = (lat: number, lon: number): Pt => [
  (lon - flinders.lon) * 111.32 * Math.cos((flinders.lat * Math.PI) / 180),
  -(lat - flinders.lat) * 110.57,
];

/**
 * A smooth map from real positions to the schematic's, fitted to the train stations within `radius` km of the
 * city; `smoothing` trades passing exactly through each station for fewer kinks between them.
 */
function schematicWarp(radius = 20, smoothing = Number(process.env.SMOOTHING ?? 3)) {
  const control = Object.values(STATIONS).flatMap((s) => {
    const real = (stations.stations as Record<string, { lat: number; lon: number }>)[s.id];
    if (!real) return [];
    const p = km(real.lat, real.lon);
    return Math.hypot(...p) <= radius ? [{ p, v: [s.x, s.y] as Pt }] : [];
  });
  const n = control.length;
  const size = n + 3;
  const U = (r: number) => (r < 1e-9 ? 0 : r * r * Math.log(r));
  const solve = (axis: 0 | 1) => {
    const A = Array.from({ length: size }, () => new Float64Array(size + 1));
    control.forEach(({ p, v }, i) => {
      control.forEach((o, j) => (A[i][j] = U(Math.hypot(p[0] - o.p[0], p[1] - o.p[1])) + (i === j ? smoothing : 0)));
      [A[i][n], A[i][n + 1], A[i][n + 2]] = [1, p[0], p[1]];
      [A[n][i], A[n + 1][i], A[n + 2][i]] = [1, p[0], p[1]];
      A[i][size] = v[axis];
    });
    // Gauss-Jordan elimination with partial pivoting.
    for (let c = 0; c < size; c++) {
      let pivot = c;
      for (let r = c + 1; r < size; r++) if (Math.abs(A[r][c]) > Math.abs(A[pivot][c])) pivot = r;
      [A[c], A[pivot]] = [A[pivot], A[c]];
      for (let r = 0; r < size; r++) {
        if (r === c) continue;
        const f = A[r][c] / A[c][c];
        if (f) for (let k = c; k <= size; k++) A[r][k] -= f * A[c][k];
      }
    }
    return A.map((row, i) => row[size] / row[i]);
  };
  const weights = [solve(0), solve(1)];
  return (lat: number, lon: number): Pt => {
    const p = km(lat, lon);
    return weights.map((w) => {
      let s = w[n] + w[n + 1] * p[0] + w[n + 2] * p[1];
      control.forEach(({ p: c }, i) => (s += w[i] * U(Math.hypot(p[0] - c[0], p[1] - c[1]))));
      return Math.round(s * 10) / 10;
    }) as Pt;
  };
}

/** One id for the stops of one name: "Glenferrie Rd/Wattletree Rd #45" → "tram-glenferrie-rd-wattletree-rd-45". */
const tramStopId = (stopName: string) => "tram-" + stopName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** "Glenferrie Rd/Wattletree Rd #45" → "Glenferrie Rd / Wattletree Rd" */
const displayName = (stopName: string) => stopName.replace(/\s*#\s*\w+\s*$/, "").replace(/\s*\/\s*/g, " / ").trim();

function build(files: Files) {
  const warp = schematicWarp();

  // A stop is the stops of one name: usually one each side of the road, sometimes more at a junction.
  const stopRows = csv(files, "stops.txt");
  const stopOf = new Map<string, string>();
  const grouped = new Map<string, typeof stopRows>();
  for (const s of stopRows) {
    const id = tramStopId(s.stop_name);
    stopOf.set(s.stop_id, id);
    grouped.set(id, [...(grouped.get(id) ?? []), s]);
  }

  const routes = csv(files, "routes.txt");
  const trips = csv(files, "trips.txt");

  // Each trip's stops in order, with times.
  const tripStops = new Map<string, [seq: number, stop: string, time: number][]>();
  eachStopTime(files, (tripId, stopId, seq, time) => {
    if (time == null) return;
    let list = tripStops.get(tripId);
    if (!list) tripStops.set(tripId, (list = []));
    list.push([seq, stopId, time]);
  });
  for (const list of tripStops.values()) list.sort((a, b) => a[0] - b[0]);

  const network: TramNetworkData = { generatedAt: new Date().toISOString(), stops: {}, routes: [] };
  const timetable: TramTimetable = { generatedAt: network.generatedAt, stopIds: {}, routes: {} };
  const used = new Set<string>();

  for (const route of routes) {
    const ofRoute = trips.filter((t) => t.route_id === route.route_id && tripStops.has(t.trip_id));
    // The drawn route is the longest way the trams run outbound (direction 0) that a fair share of them take,
    // so short runs to a depot don't cut it short, and an odd diversion doesn't make it.
    const patterns = new Map<string, { stops: string[]; count: number }>();
    for (const t of ofRoute) {
      if (t.direction_id !== "0") continue;
      const stops = tripStops.get(t.trip_id)!.map(([, stop]) => stopOf.get(stop)!);
      const key = stops.join(">");
      const p = patterns.get(key) ?? { stops, count: 0 };
      p.count++;
      patterns.set(key, p);
    }
    const most = Math.max(...[...patterns.values()].map((p) => p.count));
    const main = [...patterns.values()]
      .filter((p) => p.count >= most / 10)
      .sort((a, b) => b.stops.length - a.stops.length || b.count - a.count)[0];
    if (!main) continue;
    const onRoute = new Set(main.stops);
    main.stops.forEach((id) => used.add(id));

    const id = route.route_short_name;
    network.routes.push({
      id,
      routeId: route.route_id,
      name: route.route_long_name.replace(/\s+/g, " ").trim(),
      colour: `#${route.route_color || "78BE20"}`,
      textColour: `#${route.route_text_color || "000000"}`,
      stops: main.stops,
    });

    const tt: TramTimetable["routes"][string] = { patterns: [], trips: {} };
    const patternIndex = new Map<string, number>();
    for (const t of ofRoute) {
      const all = tripStops.get(t.trip_id)!;
      const on = all.filter(([, stop]) => onRoute.has(stopOf.get(stop)!));
      if (on.length < 2) continue;
      const start = on[0][2];
      const pattern = {
        dir: t.direction_id === "0" ? ("outbound" as const) : ("citybound" as const),
        dest: t.trip_headsign.trim(),
        stops: on.map(([seq, stop, time]): [number, string, number] => [seq, stop, time - start]),
      };
      const key = JSON.stringify(pattern);
      if (!patternIndex.has(key)) patternIndex.set(key, tt.patterns.push(pattern) - 1);
      tt.trips[t.trip_id] = [patternIndex.get(key)!, start];
    }
    timetable.routes[id] = tt;
    console.log(`Route ${id}: ${main.stops.length} stops, ${Object.keys(tt.trips).length} trips, ${tt.patterns.length} patterns`);
  }

  for (const id of used) {
    const members = grouped.get(id)!;
    const lat = members.reduce((s, m) => s + Number(m.stop_lat), 0) / members.length;
    const lon = members.reduce((s, m) => s + Number(m.stop_lon), 0) / members.length;
    const [x, y] = warp(lat, lon);
    network.stops[id] = {
      name: displayName(members[0].stop_name),
      lat: Math.round(lat * 1e6) / 1e6,
      lon: Math.round(lon * 1e6) / 1e6,
      x,
      y,
    };
    timetable.stopIds[id] = members.map((m) => m.stop_id);
  }
  // Ordered by route number, as on the buttons.
  network.routes.sort((a, b) => Number(a.id) - Number(b.id));

  mkdirSync("data/trams", { recursive: true });
  writeFileSync("data/trams/network.json", JSON.stringify(network) + "\n");
  writeFileSync("data/trams/timetable.json", JSON.stringify(timetable) + "\n");
  console.log(`${network.routes.length} routes, ${used.size} stops`);
}

const outer = unzipSync(await load(process.argv[2] ?? DEFAULT_SOURCE));
const inner = outer[`${TRAM_FOLDER}/google_transit.zip`];
if (!inner) throw new Error(`Folder ${TRAM_FOLDER} missing; found ${Object.keys(outer).join(", ")}`);
build(unzipSync(inner));
