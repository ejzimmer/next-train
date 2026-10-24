import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { toNum, type FeedMessage } from "./feed";
import { matchRoute } from "./routes";
import type { DepartureDto, DeparturesResponse, Direction, LineConfig, LineData } from "./types";

const { TripDescriptor, TripUpdate } = GtfsRealtimeBindings.transit_realtime;

/** How long after its predicted time a departure is still sent to the app (seconds). */
export const LATE_GRACE = 10 * 60;

export function buildDepartures(feed: FeedMessage, line: LineConfig, data: LineData, now: number): DeparturesResponse {
  const stationOf = new Map<string, number>();
  line.stations.forEach((s, i) => data.stations[s.id]?.stopIds.forEach((stop) => stationOf.set(stop, i)));

  const stations: Record<string, DepartureDto[]> = Object.fromEntries(line.stations.map((s) => [s.id, []]));
  for (const entity of feed.entity) {
    const tu = entity.tripUpdate;
    const tripId = tu?.trip?.tripId;
    const match = matchRoute(tu?.trip?.routeId, line);
    if (!tu || !tripId || !match) continue;
    const cancelled = tu.trip.scheduleRelationship === TripDescriptor.ScheduleRelationship.CANCELED;

    const stops = (tu.stopTimeUpdate ?? [])
      .map((u) => ({ u, index: stationOf.get(u.stopId ?? "") }))
      .filter((s): s is { u: (typeof s)["u"]; index: number } => s.index != null);
    const known = data.trips[tripId];
    const direction: Direction | null =
      known?.dir ??
      (stops.length >= 2 ? (stops[stops.length - 1].index > stops[0].index ? "outbound" : "citybound") : null);
    // Without static data, a shared-line train heading out is going to its own line's terminus.
    const destination =
      known?.dest ??
      (match.route && direction === "outbound"
        ? match.route
        : stops.length >= 2
          ? line.stations[stops[stops.length - 1].index].id
          : null);

    for (const { u, index } of stops) {
      if (u.scheduleRelationship === TripUpdate.StopTimeUpdate.ScheduleRelationship.SKIPPED) continue;
      const station = line.stations[index];
      // Departure time where given; arrival time at the terminus.
      const time = toNum(u.departure?.time) || toNum(u.arrival?.time);
      // Recently-due departures stay in, so the board can keep a train that is late leaving.
      if (!time || time < now - LATE_GRACE || station.id === destination) continue;
      const platform = line.platformStations.includes(station.id)
        ? (data.stations[station.id].platforms[u.stopId ?? ""] ?? null)
        : null;
      stations[station.id].push({ tripId, time, direction, destination, route: match.route, platform, cancelled });
    }
  }
  for (const list of Object.values(stations)) list.sort((a, b) => a.time - b.time);
  return { feedTimestamp: toNum(feed.header.timestamp), stations };
}
