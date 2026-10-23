import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { toNum, type FeedMessage } from "./feed";
import type { DepartureDto, DeparturesResponse, Direction, LineConfig, LineData } from "./types";

const { TripDescriptor, TripUpdate } = GtfsRealtimeBindings.transit_realtime;

export function buildDepartures(feed: FeedMessage, line: LineConfig, data: LineData, now: number): DeparturesResponse {
  const stationOf = new Map<string, number>();
  line.stations.forEach((s, i) => data.stations[s.id]?.stopIds.forEach((stop) => stationOf.set(stop, i)));

  const stations: Record<string, DepartureDto[]> = Object.fromEntries(line.stations.map((s) => [s.id, []]));
  for (const entity of feed.entity) {
    const tu = entity.tripUpdate;
    const tripId = tu?.trip?.tripId;
    if (!tu || !tripId || !tu.trip.routeId?.includes(line.routeIdMatch)) continue;
    const cancelled = tu.trip.scheduleRelationship === TripDescriptor.ScheduleRelationship.CANCELED;

    const stops = (tu.stopTimeUpdate ?? [])
      .map((u) => ({ u, index: stationOf.get(u.stopId ?? "") }))
      .filter((s): s is { u: (typeof s)["u"]; index: number } => s.index != null);
    const known = data.trips[tripId];
    const direction: Direction | null =
      known?.dir ??
      (stops.length >= 2 ? (stops[stops.length - 1].index > stops[0].index ? "outbound" : "citybound") : null);
    const destination = known?.dest ?? (stops.length >= 2 ? line.stations[stops[stops.length - 1].index].id : null);

    for (const { u, index } of stops) {
      if (u.scheduleRelationship === TripUpdate.StopTimeUpdate.ScheduleRelationship.SKIPPED) continue;
      const station = line.stations[index];
      // Departure time where given; arrival time at the terminus.
      const time = toNum(u.departure?.time) || toNum(u.arrival?.time);
      if (!time || time < now - 30 || station.id === destination) continue;
      const platform = line.platformStations.includes(station.id)
        ? (data.stations[station.id].platforms[u.stopId ?? ""] ?? null)
        : null;
      stations[station.id].push({ tripId, time, direction, destination, platform, cancelled });
    }
  }
  for (const list of Object.values(stations)) list.sort((a, b) => a.time - b.time);
  return { feedTimestamp: toNum(feed.header.timestamp), stations };
}
