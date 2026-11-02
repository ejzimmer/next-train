import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { cities, tramData } from "../shared/lines";
import { liveTrams, matchDepartures, resetRouteIds, signedUrl, timingStops, type DeparturesResponse } from "../shared/ptvTimetable";
import { serviceMidnight } from "../shared/schedule";
import { scheduledTrams, scheduledTrip } from "../shared/scheduledTrams";

const creds = { devid: "1234567", key: "abcd-ef" };
// 9am on a weekday the timetable covers.
const now = Date.parse("2026-11-11T22:00:00Z") / 1000;
const { config, data } = cities.melbourne["tram-96"];

/** A departure for a trip the timetable has running now, at the first stop asked about that's ahead of it. */
function departureAhead(late: number) {
  const tram = scheduledTrams(config, data, tramData, now).find((t) => t.direction === "outbound")!;
  const [p, start] = tramData.routes["96"].trips[tram.tripId];
  const midnight = serviceMidnight("20261112")!;
  const asked = new Set(timingStops(config, data));
  const [, stop, offset] = tramData.routes["96"].patterns[p].stops.find(([, s, o]) => asked.has(s) && midnight + start + o > now)!;
  const at = (s: number) => new Date(s * 1000).toISOString().replace(/\.000/, "");
  const response: DeparturesResponse = {
    departures: [
      {
        stop_id: Number(stop),
        route_id: 1881,
        run_ref: "run-1",
        direction_id: 2,
        scheduled_departure_utc: at(midnight + start + offset),
        estimated_departure_utc: at(midnight + start + offset + late),
      },
    ],
    runs: { "run-1": { vehicle_descriptor: { id: "6011" } } },
  };
  return { tram, stop, response };
}

describe("PTV Timetable API", () => {
  it("signs the path and query, devid included", () => {
    const url = signedUrl("/v3/routes?route_types=1", creds);
    const sig = createHmac("sha1", creds.key).update("/v3/routes?route_types=1&devid=1234567").digest("hex").toUpperCase();
    expect(url).toBe(`https://timetableapi.ptv.vic.gov.au/v3/routes?route_types=1&devid=1234567&signature=${sig}`);
  });

  it("asks about stops all along the route, both sides of the road", () => {
    const stops = timingStops(config, data);
    expect(stops.length).toBeGreaterThan(config.stations.length / 6);
    const last = config.stations[config.stations.length - 1];
    expect(stops).toEqual(expect.arrayContaining(data.stations[last.id].stopIds));
  });

  it("matches a departure to its timetable trip, with how late it is and its tram", () => {
    const { tram, response } = departureAhead(180);
    const live = matchDepartures("96", [response], tramData, now);
    expect(live.get(tram.tripId)).toEqual({ delay: 180, fleet: "6011" });
  });

  it("places a late tram behind where its timetable has it, drawn as live", () => {
    const { tram, response } = departureAhead(300);
    const live = matchDepartures("96", [response], tramData, now);
    const moved = scheduledTrams(config, data, tramData, now, live).find((t) => t.tripId === tram.tripId)!;
    expect(moved.scheduled).toBeUndefined();
    expect(moved.delay).toBe(300);
    expect(moved.trainType).toBe("E-class");
    const at = (t: typeof tram) => t.segment + t.fraction;
    expect(at(moved)).toBeLessThan(at(tram));
    const late = scheduledTrip(tram.tripId, data, now, 300)!;
    const onTime = scheduledTrip(tram.tripId, data, now)!;
    const stop = late.stops[late.stops.length - 1];
    expect(stop.time - onTime.stops.find((s) => s.station === stop.station)!.time).toBe(300);
  });

  it("asks about each route shown, by the API's route id", async () => {
    resetRouteIds();
    const { response } = departureAhead(60);
    const asked: string[] = [];
    const fetcher = async (url: string) => {
      asked.push(url);
      const body = url.includes("/v3/routes?")
        ? { routes: [{ route_id: 1881, route_number: "96", route_type: 1 }] }
        : url.includes(`/stop/${response.departures[0].stop_id}/`)
          ? response
          : { departures: [] };
      return new Response(JSON.stringify(body));
    };
    const live = await liveTrams([{ config, data }], tramData, now, creds, fetcher);
    expect(asked.filter((u) => u.includes("/route/1881?")).length).toBe(timingStops(config, data).length);
    expect(live.get("tram-96")?.size).toBe(1);
  });
});
