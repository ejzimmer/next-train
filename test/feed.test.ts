import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeFeed } from "../shared/feed";
import { buildAlerts } from "../shared/alerts";
import { buildDepartures, withScheduledGaps } from "../shared/departures";
import { lines } from "../shared/lines";
import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { calendarWeeks, disruptedDays } from "../src/calendar";
import { isLineRoute, progress } from "../shared/routes";
import { directionFromBearing, placeOnLine } from "../shared/position";
import { buildVehicles } from "../shared/vehicles";
import { trainType } from "../shared/trainType";
import type { LineConfig, LineData, LineTimes } from "../shared/types";

// Snapshots of the live Metro feeds saved on 2026-10-17 around 22:00 Melbourne time.
const vehiclesFeed = decodeFeed(readFileSync(new URL("./fixtures/vehicle-positions.pb", import.meta.url)));
const tripsFeed = decodeFeed(readFileSync(new URL("./fixtures/trip-updates.pb", import.meta.url)));

// A made-up three-station line around Ivanhoe, city end first.
const line: LineConfig = {
  id: "test",
  mode: "metro-train",
  name: "Test",
  colour: "#BE1014",
  textColour: "#FFFFFF",
  group: "clifton-hill",
  routeIdMatch: "-HBE:",
  platformStations: ["a"],
  track: [],
  stations: [
    { id: "a", name: "A", x: 0, y: 50, label: "b" },
    { id: "b", name: "B", x: 100, y: 50, label: "b" },
    { id: "c", name: "C", x: 200, y: 50, label: "b" },
  ],
};
const data: LineData = {
  generatedAt: "",
  stations: {
    a: { lat: -37.76, lon: 145.04, stopIds: ["15327", "15329"], platforms: { "15327": "1", "15329": "2" } },
    b: { lat: -37.73, lon: 145.06, stopIds: ["15331", "15333"], platforms: {} },
    c: { lat: -37.7, lon: 145.08, stopIds: ["15335", "15336", "15337"], platforms: {} },
  },
  trips: {},
};

describe("placeOnLine", () => {
  it("puts a point halfway between two stations at fraction 0.5", () => {
    const p = placeOnLine(-37.745, 145.05, line, data)!;
    expect(p.segment).toBe(0);
    expect(p.fraction).toBeCloseTo(0.5, 1);
    expect(p.offLine).toBeLessThan(50);
  });
});

describe("directionFromBearing", () => {
  it("compares the train's bearing with the outbound bearing", () => {
    expect(directionFromBearing(30, 10)).toBe("outbound");
    expect(directionFromBearing(200, 10)).toBe("citybound");
    expect(directionFromBearing(350, 10)).toBe("outbound");
  });
});

describe("buildVehicles", () => {
  it("keeps only Hurstbridge trains near the line", () => {
    const res = buildVehicles(vehiclesFeed, line, data);
    expect(res.feedTimestamp).toBeGreaterThan(0);
    // The snapshot has 5 Hurstbridge trains; two are near Ivanhoe and Rosanna, inside this test line's area.
    expect(res.vehicles.length).toBeGreaterThan(0);
    expect(res.vehicles.length).toBeLessThanOrEqual(5);
    for (const v of res.vehicles) {
      expect(v.tripId).toContain("HBE");
      expect(v.fraction).toBeGreaterThanOrEqual(0);
      expect(v.fraction).toBeLessThanOrEqual(1);
    }
  });
});

describe("buildDepartures", () => {
  it("groups predicted times by station with direction and platform", () => {
    const now = Number(tripsFeed.header.timestamp) - 3600;
    const res = buildDepartures(tripsFeed, line, data, now);
    const a = res.stations.a;
    // Trip 1296 runs 15337 → 15327, so it is citybound and terminates at A: no departure listed at A.
    expect(a.find((d) => d.tripId === "02-HBE--71-T2-1296")).toBeUndefined();
    const atB = res.stations.b.find((d) => d.tripId === "02-HBE--71-T2-1296")!;
    expect(atB.direction).toBe("citybound");
    expect(atB.destination).toBe("a");
    expect(atB.platform).toBeNull();
    const all = Object.values(res.stations).flat();
    expect(all.every((d) => d.time > 0)).toBe(true);
    expect(res.stations.c.map((d) => d.time)).toEqual([...res.stations.c.map((d) => d.time)].sort((x, y) => x - y));
  });
});

describe("trainType", () => {
  it("recognises each fleet from its car numbers", () => {
    expect(trainType("1403T-1686T-205M-206M-971M-972M")).toEqual({ type: "X'Trapolis 100", cars: 6 });
    expect(trainType("2504T-2509T-707M-708M-717M-718M")).toEqual({ type: "Siemens Nexas", cars: 6 });
    expect(trainType("1010T-1089T-343M-384M-477M-478M")).toEqual({ type: "Comeng", cars: 6 });
    expect(trainType("9046M-9946M")).toEqual({ type: "HCMT", cars: 7 });
    expect(trainType("1349T-97M-98M")).toEqual({ type: "X'Trapolis 100", cars: 3 });
    expect(trainType("X99")).toEqual({ type: null, cars: 0 });
  });

  it("recognises every train in the saved feed", () => {
    const unknown = vehiclesFeed.entity.map((e) => e.vehicle?.vehicle?.id ?? "").filter((id) => !trainType(id).type);
    expect(unknown).toEqual([]);
  });
});

// Saved on 2026-10-23 around 21:10 Melbourne time, during Heidelberg–Greensborough bus replacement works.
const vehiclesFeed23 = decodeFeed(readFileSync(new URL("./fixtures/vehicle-positions-2026-10-23.pb", import.meta.url)));
const alertsFeed = decodeFeed(readFileSync(new URL("./fixtures/service-alerts.pb", import.meta.url)));
const hurstbridge = lines.hurstbridge;

describe("isLineRoute", () => {
  it("knows the line's own trains, but not its replacement buses or other lines", () => {
    const cfg = hurstbridge.config;
    expect(isLineRoute("aus:vic:vic-02-HBE:", cfg)).toBe(true);
    expect(isLineRoute("aus:vic:vic-02-HBE-R:", cfg)).toBe(false);
    expect(isLineRoute("aus:vic:vic-02-MDD:", cfg)).toBe(false);
  });
});

describe("buildVehicles across the network", () => {
  const res = buildVehicles(vehiclesFeed23, hurstbridge.config, hurstbridge.data);
  const mernda = buildVehicles(vehiclesFeed23, lines.mernda.config, lines.mernda.data);

  it("puts each train on its own line only", () => {
    expect(res.vehicles.every((v) => v.line === "hurstbridge" && v.tripId.includes("HBE"))).toBe(true);
    // Mernda trains up near Thomastown are on the Mernda line, past Clifton Hill.
    const thomastown = mernda.vehicles.find((v) => v.tripId === "02-MDD--72-T6-1166")!;
    expect(thomastown.segment).toBeGreaterThan(10);
  });

  it("lists a train once when it's reported against two trips", () => {
    const ids = res.vehicles.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("1372T-1436T-143M-144M-271M-272M");
  });

  it("picks the later trip, whatever the feed order, when both reports carry the same time", () => {
    // Seen at Eltham on 2026-10-25: 1299 had terminated there and the same train was booked as 1392.
    const { lat, lon } = hurstbridge.data.stations.eltham;
    const report = (tripId: string) => ({
      id: tripId,
      vehicle: {
        trip: { tripId, routeId: "aus:vic:vic-02-HBE:" },
        vehicle: { id: "1001M-1601T-1002M-1003M-1602T-1004M" },
        position: { latitude: lat, longitude: lon },
        timestamp: 1792792314,
      },
    });
    const feed = (...tripIds: string[]) =>
      GtfsRealtimeBindings.transit_realtime.FeedMessage.create({
        header: { gtfsRealtimeVersion: "2.0", timestamp: 1792792330 },
        entity: tripIds.map(report),
      });
    for (const order of [["02-HBE--72-T3-1299", "02-HBE--72-T3-1392"], ["02-HBE--72-T3-1392", "02-HBE--72-T3-1299"]]) {
      // Their scheduled starts, as in that day's timetable: 1299 earlier, 1392 later.
      const times = { patterns: [], trips: { "02-HBE--72-T3-1299": [0, 77000], "02-HBE--72-T3-1392": [0, 78500] } } as unknown as LineTimes;
      const { vehicles } = buildVehicles(feed(...order), hurstbridge.config, { ...hurstbridge.data, times });
      expect(vehicles.map((v) => v.tripId)).toEqual(["02-HBE--72-T3-1392"]);
    }
  });
});

describe("buildAlerts", () => {
  const now = Number(alertsFeed.header.timestamp);
  const { alerts } = buildAlerts(alertsFeed, hurstbridge.config, hurstbridge.data, now);

  it("keeps train disruptions only, merging the two alerts Metro posts for the same works", () => {
    expect(alerts.map((a) => a.effect)).not.toContain("OTHER_EFFECT");
    const buses = alerts.filter((a) => a.kind === "buses");
    expect(buses).toHaveLength(1);
    expect(buses[0].stretch).toEqual({ from: "heidelberg", to: "greensborough" });
    // The "Planned work: ..." alert's start (8:30pm), not the generic one's earlier go-live time.
    expect(buses[0].start).toBe(Date.UTC(2026, 9, 23, 9, 30) / 1000);
    expect(buses[0].description).toContain("Replacement buses are subject to local traffic");
    // Other lines' works aren't included.
    expect(alerts.some((a) => a.description.includes("Sunbury line services"))).toBe(false);
  });

  it("drops alerts that have ended or start more than a week away", () => {
    for (const a of alerts) {
      expect(a.end == null || a.end > now).toBe(true);
      expect(a.start == null || a.start < now + 7 * 24 * 3600).toBe(true);
    }
  });
});

describe("City Loop closures", () => {
  // Metro's wording from its planned works pages; none were in the live feed when this was written.
  const alert = (header: string, description: string) =>
    GtfsRealtimeBindings.transit_realtime.FeedMessage.create({
      header: { gtfsRealtimeVersion: "2.0", timestamp: 1792800000 },
      entity: [
        {
          id: "1",
          alert: {
            effect: GtfsRealtimeBindings.transit_realtime.Alert.Effect.MODIFIED_SERVICE,
            activePeriod: [{ start: 1792800000, end: 1792900000 }],
            informedEntity: [{ routeId: "aus:vic:vic-02-HBE:" }],
            headerText: { translation: [{ text: header, language: "en" }] },
            descriptionText: { translation: [{ text: description, language: "en" }] },
          },
        },
      ],
    });

  it.each([
    ["Planned work: Trains run direct to and from Flinders Street, not via the City Loop", ""],
    ["Planned Works", "No City Loop trains from 9pm Friday to last train Sunday."],
  ])("recognises %s", (header, description) => {
    const [a] = buildAlerts(alert(header, description), hurstbridge.config, hurstbridge.data, 1792800000).alerts;
    expect(a.kind).toBe("loop");
    expect(a.stretch).toEqual({ from: "flinders-street", to: "parliament" });
  });
});

describe("disruptedDays", () => {
  // Melbourne is UTC+11 in October.
  const melb = (d: number, h: number, m = 0) => Date.UTC(2026, 9, d, h - 11, m) / 1000;

  it("marks a Friday night to Sunday closure as Friday night, then all day", () => {
    const days = disruptedDays([{ start: melb(23, 20, 30), end: melb(25, 23, 59) }], melb(23, 12));
    expect(Object.fromEntries(days)).toEqual({ "2026-10-23": "night", "2026-10-24": "all-day", "2026-10-25": "all-day" });
  });

  it("counts after-midnight running as the night before", () => {
    const nights = [26, 27].map((d) => ({ start: melb(d, 20), end: melb(d + 1, 2) }));
    expect(Object.fromEntries(disruptedDays(nights, melb(26, 12)))).toEqual({
      "2026-10-26": "night",
      "2026-10-27": "night",
    });
  });

  it("lays the days out in Monday-to-Sunday weeks", () => {
    const weeks = calendarWeeks(["2026-10-23", "2026-10-26"]);
    expect(weeks.map((w) => [w[0], w[6]])).toEqual([
      ["2026-10-19", "2026-10-25"],
      ["2026-10-26", "2026-11-01"],
    ]);
  });
});

describe("withScheduledGaps", () => {
  const { StopTimeUpdate } = GtfsRealtimeBindings.transit_realtime.TripUpdate;
  const times = { patterns: [[[1, "s1", 0], [2, "s2", 180], [3, "s3", 900], [4, "s4", 1140]]], trips: { t: [0, 1000] } } as LineTimes;

  it("fills a skipped stop with the previous stop's delay", () => {
    const updates = [
      StopTimeUpdate.create({ stopSequence: 2, stopId: "s2", departure: { time: 1300 } }),
      StopTimeUpdate.create({ stopSequence: 4, stopId: "s4", arrival: { time: 2260 } }),
    ];
    const filled = withScheduledGaps(updates, times, "t");
    // Scheduled 1180 at s2 but leaving 1300: two minutes late, so s3 at 1900 + 120.
    expect(filled.map((u) => [u.stopId, u.departure?.time ?? u.arrival?.time])).toEqual([
      ["s2", 1300],
      ["s3", 2020],
      ["s4", 2260],
    ]);
  });

  it("leaves trips without a timetable alone", () => {
    const updates = [StopTimeUpdate.create({ stopSequence: 2, stopId: "s2", departure: { time: 1300 } })];
    expect(withScheduledGaps(updates, times, "other")).toBe(updates);
  });
});
