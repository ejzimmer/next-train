import type { LineConfig } from "./types";

export interface MatchedRoute {
  /** null for the line's own trains, otherwise the shared line's name. */
  route: string | null;
  /** Index of the last station this route's trains run through on our line. */
  until: number;
}

/** Which of the line's own or shared routes a GTFS route_id belongs to, if any. */
export function matchRoute(routeId: string | null | undefined, line: LineConfig): MatchedRoute | null {
  if (!routeId) return null;
  if (routeId.includes(line.routeIdMatch)) return { route: null, until: line.stations.length - 1 };
  const shared = line.shared?.find((s) => routeId.includes(s.routeIdMatch));
  if (!shared) return null;
  return { route: shared.name, until: line.stations.findIndex((s) => s.id === shared.until) };
}
