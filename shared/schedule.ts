import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { toNum } from "./feed";
import type { LineData } from "./types";

const { TripUpdate } = GtfsRealtimeBindings.transit_realtime;
type StopTimeUpdate = GtfsRealtimeBindings.transit_realtime.TripUpdate.IStopTimeUpdate;

/** Station id by GTFS stop id; every line in a city shares one stations table, so it's worked out once. */
const byStop = new WeakMap<LineData["stations"], Map<string, string>>();
export function stationsByStop(data: LineData) {
  let map = byStop.get(data.stations);
  if (!map) {
    map = new Map();
    for (const [id, s] of Object.entries(data.stations)) for (const stop of s.stopIds) map.set(stop, id);
    byStop.set(data.stations, map);
  }
  return map;
}

// Melbourne and Sydney keep the same time, daylight saving included.
const localHour = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Melbourne", hour: "numeric", hourCycle: "h23" });
const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne", year: "numeric", month: "2-digit", day: "2-digit" });

/** Unix seconds at noon minus 12 hours, local time, on a GTFS service date (YYYYMMDD): what GTFS times count from. */
export function serviceMidnight(date: string | null | undefined): number | null {
  const m = date?.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return null;
  const noonUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], 12);
  // The offset at noon that day, from how the date reads there.
  const parts = localHour.formatToParts(noonUtc);
  const hour = Number(parts.find((p) => p.type === "hour")!.value);
  const offset = (((hour - 12) % 24) + 24) % 24;
  return noonUtc / 1000 - (offset + 12) * 3600;
}

/**
 * When the feed doesn't give a trip's service date (Sydney Trains doesn't), the one that puts the trip's
 * scheduled start (seconds after midnight) nearest to now.
 */
export function nearestServiceMidnight(start: number, now: number): number {
  const candidates = [-1, 0, 1].map((days) => serviceMidnight(localDate.format((now + days * 86400) * 1000).replace(/-/g, ""))!);
  return candidates.reduce((best, m) => (Math.abs(m + start - now) < Math.abs(best + start - now) ? m : best));
}

const hasTime = (u: StopTimeUpdate) => !!(toNum(u.departure?.time) || toNum(u.arrival?.time));

/**
 * Sydney Trains' updates name each stop (sometimes a different platform from the timetable's) and how late the
 * train is there, but give neither the stop_sequence nor the time. Fills both in from the timetable, matching
 * stops in order by station. Updates that already have both, or for trips the timetable doesn't know, are kept.
 */
export function resolveUpdates(
  updates: StopTimeUpdate[],
  data: LineData,
  tripId: string,
  startDate: string | null | undefined,
  now: number,
): StopTimeUpdate[] {
  const trip = data.times?.trips[tripId];
  if (!trip || updates.every((u) => u.stopSequence && hasTime(u))) return updates;
  const [patternIndex, start] = trip;
  const pattern = data.times!.patterns[patternIndex];
  const station = stationsByStop(data);
  const midnight = serviceMidnight(startDate) ?? nearestServiceMidnight(start, now);
  let from = 0;
  return updates.map((u) => {
    let k = u.stopSequence ? pattern.findIndex(([seq]) => seq === u.stopSequence) : -1;
    if (!u.stopSequence) {
      const at = station.get(u.stopId ?? "");
      k = pattern.findIndex(([, stop], i) => i >= from && (stop === u.stopId || (!!at && station.get(stop) === at)));
      if (k < 0) return u;
      from = k + 1;
    }
    if (k < 0) return u;
    const [seq, , offset] = pattern[k];
    const scheduled = midnight + start + offset;
    const resolved = Object.assign(TripUpdate.StopTimeUpdate.create(), u, { stopSequence: seq });
    if (!hasTime(u)) {
      if (u.arrival) resolved.arrival = { delay: u.arrival.delay, time: scheduled + (u.arrival.delay ?? 0) };
      resolved.departure = { delay: u.departure?.delay, time: scheduled + (u.departure?.delay ?? u.arrival?.delay ?? 0) };
    }
    return resolved;
  });
}
