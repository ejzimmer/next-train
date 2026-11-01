/**
 * Trams where the timetable says they are, for when PTV's live tram feeds send nothing: drawn greyed as
 * timetabled, and replaced by live positions as soon as the feed has them.
 */
import { stationsByStop, nearestServiceMidnight, serviceMidnight } from "./schedule";
import { dateFormat, TIME_ZONES } from "./time";
import type { TramTimetable } from "./trams";
import type { LineConfig, LineData, TripDto, VehicleDto } from "./types";

const localDate = dateFormat("en-CA", TIME_ZONES.melbourne, { year: "numeric", month: "2-digit", day: "2-digit" });
const serviceDate = (unix: number) => localDate.format(unix * 1000).replace(/-/g, "");

const running = new WeakMap<string[][], Set<string>[]>();
/** Whether service `s` runs on `date`. */
function runs(services: string[][], s: number, date: string) {
  let sets = running.get(services);
  if (!sets) running.set(services, (sets = services.map((d) => new Set(d))));
  return sets[s]?.has(date) ?? false;
}

/** Each running trip's place on the line now, by its timetable (today's trips and last night's still out). */
export function scheduledTrams(line: LineConfig, data: LineData, timetable: TramTimetable, now: number): VehicleDto[] {
  const route = timetable.routes[line.id.replace(/^tram-/, "")];
  if (!route) return [];
  const stationOf = stationsByStop(data);
  const index = new Map(line.stations.map((s, i) => [s.id, i]));
  const days = [serviceDate(now - 86_400), serviceDate(now)].map((date) => ({ date, midnight: serviceMidnight(date)! }));
  const out: VehicleDto[] = [];
  for (const [tripId, [p, start, service]] of Object.entries(route.trips)) {
    for (const { date, midnight } of days) {
      const t = now - (midnight + start);
      const { stops, dir, dest } = route.patterns[p];
      if (t < 0 || t > stops[stops.length - 1][2] || !runs(timetable.services, service, date)) continue;
      const k = stops.findIndex((s, i) => i < stops.length - 1 && s[2] <= t && t < stops[i + 1][2]);
      if (k < 0) continue;
      const i = index.get(stationOf.get(stops[k][1]) ?? "");
      const j = index.get(stationOf.get(stops[k + 1][1]) ?? "");
      if (i == null || j == null || Math.abs(i - j) !== 1) continue;
      const f = (t - stops[k][2]) / (stops[k + 1][2] - stops[k][2]);
      out.push({
        id: `timetabled:${tripId}`,
        tripId,
        line: line.id,
        destination: dest,
        timestamp: now,
        direction: dir,
        segment: Math.min(i, j),
        fraction: j > i ? f : 1 - f,
        trainType: null,
        cars: 1,
        carNumbers: null,
        scheduled: true,
      });
    }
  }
  return out;
}

/** A tram trip's remaining stops by its timetable, when the live feed doesn't have it. */
export function scheduledTrip(tripId: string, data: LineData, now: number): TripDto | null {
  const timed = data.times?.trips[tripId];
  if (!timed) return null;
  const [p, start] = timed;
  const midnight = nearestServiceMidnight(start, now, TIME_ZONES.melbourne);
  const stationOf = stationsByStop(data);
  const stops = data.times!.patterns[p]
    .map(([, stop, offset]) => ({ station: stationOf.get(stop) ?? "", time: midnight + start + offset, platform: null }))
    .filter((s) => s.station && s.time >= now - 30);
  return { tripId, destination: data.trips[tripId]?.dest ?? null, viaLoop: null, delay: null, stops };
}
