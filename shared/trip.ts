import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { toNum, type FeedMessage } from "./feed";
import { withScheduledGaps } from "./departures";
import { nearestServiceMidnight, resolveUpdates, serviceMidnight, stationsByStop } from "./schedule";
import type { LineConfig, LineData, TripDto } from "./types";

const { TripUpdate } = GtfsRealtimeBindings.transit_realtime;

/** A stop whose predicted time passed this long ago (seconds) is taken as left behind. */
const PASSED = 30;

/**
 * Whether a trip to Flinders Street gets there round the City Loop, from the stations it calls at.
 * Null on lines without a Loop, or when Flinders Street is the only stop known.
 */
export function viaLoop(stationIds: string[], line: LineConfig): boolean | null {
  if (!line.cityLoop || stationIds.every((id) => id === line.cityLoop![0])) return null;
  const [from, to] = line.cityLoop.map((id) => line.stations.findIndex((s) => s.id === id));
  const loop = new Set(line.stations.slice(from + 1, to + 1).map((s) => s.id));
  return stationIds.some((id) => loop.has(id));
}

/**
 * One trip's remaining stops, with how late it's running at the next one. `platformStations` are the
 * stations whose platform is shown (those on more than one line); null when the trip isn't in the feed.
 */
export function buildTrip(
  feed: FeedMessage,
  tripId: string,
  line: LineConfig,
  data: LineData,
  platformStations: Set<string>,
  now: number,
): TripDto | null {
  const tu = feed.entity.find((e) => e.tripUpdate?.trip?.tripId === tripId)?.tripUpdate;
  if (!tu) return null;
  const stationOf = stationsByStop(data);

  // Scheduled times by stop_sequence, for how late the train is.
  const timed = data.times?.trips[tripId];
  const pattern = timed ? data.times!.patterns[timed[0]] : [];
  const scheduled = new Map(pattern.map(([seq, , offset]) => [seq, timed![1] + offset]));
  const midnight = serviceMidnight(tu.trip.startDate) ?? (timed ? nearestServiceMidnight(timed[1], now) : null);

  const resolved = resolveUpdates(tu.stopTimeUpdate ?? [], data, tripId, tu.trip.startDate, now);
  const updates = withScheduledGaps(resolved, data.times, tripId);
  const stops: TripDto["stops"] = [];
  let delay: number | null = null;
  for (const u of updates) {
    const station = stationOf.get(u.stopId ?? "");
    const time = toNum(u.arrival?.time) || toNum(u.departure?.time);
    if (!station || !time || u.scheduleRelationship === TripUpdate.StopTimeUpdate.ScheduleRelationship.SKIPPED) continue;
    if (time < now - PASSED) continue;
    if (!stops.length) {
      const sched = scheduled.get(u.stopSequence ?? -1);
      delay = sched != null && midnight != null ? time - (midnight + sched) : (u.arrival?.delay ?? u.departure?.delay ?? null);
    }
    const platform = platformStations.has(station) ? (data.stations[station].platforms[u.stopId ?? ""] ?? null) : null;
    stops.push({ station, time, platform });
  }

  const destination = data.trips[tripId]?.dest ?? stops[stops.length - 1]?.station ?? null;
  const calls = [...pattern.map(([, stop]) => stationOf.get(stop) ?? ""), ...stops.map((s) => s.station)];
  return {
    tripId,
    destination,
    viaLoop: destination === "flinders-street" ? viaLoop(calls, line) : null,
    delay,
    stops,
  };
}
