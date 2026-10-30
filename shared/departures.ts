import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { toNum, type FeedMessage } from "./feed";
import { isLineRoute } from "./routes";
import type { DepartureDto, DeparturesResponse, Direction, LineConfig, LineData, LineTimes } from "./types";

const { TripDescriptor, TripUpdate } = GtfsRealtimeBindings.transit_realtime;

/** How long after its predicted time a departure is still sent to the app (seconds). */
export const LATE_GRACE = 10 * 60;

type StopTimeUpdate = GtfsRealtimeBindings.transit_realtime.TripUpdate.IStopTimeUpdate;

/**
 * The feed often leaves stops out of a trip's updates; per GTFS-Realtime they keep the delay of
 * the stop before. Fill those in from the timetable, so every station on the way gets the train.
 */
export function withScheduledGaps(updates: StopTimeUpdate[], times: LineTimes | undefined, tripId: string) {
  const trip = times?.trips[tripId];
  if (!trip || updates.length === 0) return updates;
  const [patternIndex, start] = trip;
  const bySeq = new Map(updates.map((u) => [u.stopSequence, u]));
  const firstSeq = Math.min(...updates.map((u) => u.stopSequence ?? Infinity));
  const filled: StopTimeUpdate[] = [];
  let prev: { time: number; scheduled: number } | null = null;
  for (const [seq, stopId, offset] of times.patterns[patternIndex]) {
    const scheduled = start + offset;
    const u = bySeq.get(seq);
    if (u) {
      const time = toNum(u.departure?.time) || toNum(u.arrival?.time);
      if (time) prev = { time, scheduled };
      filled.push(u);
    } else if (prev && seq > firstSeq) {
      const time = prev.time + (scheduled - prev.scheduled);
      filled.push(TripUpdate.StopTimeUpdate.create({ stopSequence: seq, stopId, departure: { time } }));
    }
  }
  // Updates for stops the timetable doesn't have (e.g. off our line) are kept as they were.
  const scheduledSeqs = new Set(times.patterns[patternIndex].map(([seq]) => seq));
  return [...filled, ...updates.filter((u) => !scheduledSeqs.has(u.stopSequence ?? -1))].sort(
    (a, b) => (a.stopSequence ?? 0) - (b.stopSequence ?? 0),
  );
}

export function buildDepartures(feed: FeedMessage, line: LineConfig, data: LineData, now: number): DeparturesResponse {
  const stationOf = new Map<string, number>();
  line.stations.forEach((s, i) => data.stations[s.id]?.stopIds.forEach((stop) => stationOf.set(stop, i)));

  const stations: Record<string, DepartureDto[]> = Object.fromEntries(line.stations.map((s) => [s.id, []]));
  for (const entity of feed.entity) {
    const tu = entity.tripUpdate;
    const tripId = tu?.trip?.tripId;
    if (!tu || !tripId || !isLineRoute(tu.trip?.routeId, line)) continue;
    const cancelled = tu.trip.scheduleRelationship === TripDescriptor.ScheduleRelationship.CANCELED;

    const stops = withScheduledGaps(tu.stopTimeUpdate ?? [], data.times, tripId)
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
      // Recently-due departures stay in, so the board can keep a train that is late leaving.
      if (!time || time < now - LATE_GRACE || station.id === destination) continue;
      const platform = line.platformStations.includes(station.id)
        ? (data.stations[station.id].platforms[u.stopId ?? ""] ?? null)
        : null;
      stations[station.id].push({ tripId, time, direction, destination, line: line.id, platform, cancelled });
    }
  }
  for (const list of Object.values(stations)) list.sort((a, b) => a.time - b.time);
  return { feedTimestamp: toNum(feed.header.timestamp), stations };
}
