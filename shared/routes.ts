import type { LineConfig } from "./types";

/** Whether a GTFS route_id is the line's own (not its replacement buses). */
export function isLineRoute(routeId: string | null | undefined, line: LineConfig): boolean {
  return !!routeId && line.routeIdMatch.some((m) => routeId.includes(m));
}

/** The two stations at the ends of segment `i`: next to each other in `stations`, or one of the extra `track`s. */
export function segmentEnds(line: LineConfig, i: number): [string, string] {
  const n = line.stations.length - 1;
  if (i < n) return [line.stations[i].id, line.stations[i + 1].id];
  const t = line.track[i - n];
  return [t.from, t.to];
}

export function segmentCount(line: LineConfig) {
  return line.stations.length - 1 + line.track.length;
}

/** How far along the line, in stations from the city end, `fraction` of the way along segment `i` is. */
export function progress(line: LineConfig, segment: number, fraction: number) {
  const [a, b] = segmentEnds(line, segment).map((id) => line.stations.findIndex((s) => s.id === id));
  return a + (b - a) * fraction;
}
