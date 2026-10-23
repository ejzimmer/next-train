import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeFeed } from "../shared/feed";
import { buildAlerts } from "../shared/alerts";
import { buildDepartures } from "../shared/departures";
import { lines } from "../shared/lines";
import { matchRoute } from "../shared/routes";
import { directionFromBearing, placeOnLine } from "../shared/position";
import { buildVehicles } from "../shared/vehicles";
import { trainType } from "../shared/trainType";
import type { LineConfig, LineData } from "../shared/types";

// Snapshots of the live Metro feeds saved on 2026-10-17 around 22:00 Melbourne time.
const vehiclesFeed = decodeFeed(readFileSync(new URL("./fixtures/vehicle-positions.pb", import.meta.url)));
const tripsFeed = decodeFeed(readFileSync(new URL("./fixtures/trip-updates.pb", import.meta.url)));

// A made-up three-station line around Ivanhoe, city end first.
const line: LineConfig = {
  id: "test",
  mode: "metro-train",
  name: "Test",
  colour: "#BE1014",
  routeIdMatch: "-HBE:",
  platformStations: ["a"],
  schematic: { width: 300, height: 100 },
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

describe("matchRoute", () => {
  it("knows the line's own routes and the shared Mernda route, but not replacement buses", () => {
    const cfg = hurstbridge.config;
    expect(matchRoute("aus:vic:vic-02-HBE:", cfg)).toEqual({ route: null, until: cfg.stations.length - 1 });
    expect(matchRoute("aus:vic:vic-02-MDD:", cfg)).toEqual({ route: "Mernda", until: 10 });
    expect(matchRoute("aus:vic:vic-02-HBE-R:", cfg)).toBeNull();
    expect(matchRoute("aus:vic:vic-02-SUY:", cfg)).toBeNull();
  });
});

describe("buildVehicles with shared track", () => {
  const res = buildVehicles(vehiclesFeed23, hurstbridge.config, hurstbridge.data);

  it("shows Mernda trains only between the city and Clifton Hill", () => {
    const mernda = res.vehicles.filter((v) => v.route === "Mernda");
    expect(mernda.length).toBeGreaterThan(0);
    for (const v of mernda) expect(v.segment).toBeLessThan(10);
    // Mernda trains up near Thomastown are on their own line, not ours.
    expect(res.vehicles.find((v) => v.tripId === "02-MDD--72-T6-1166")).toBeUndefined();
    expect(res.vehicles.find((v) => v.tripId === "02-MDD--72-T6-1769")?.direction).toBe("outbound");
  });

  it("lists a train once when it's reported against two trips", () => {
    const ids = res.vehicles.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("1372T-1436T-143M-144M-271M-272M");
  });
});

describe("buildAlerts", () => {
  const now = Number(alertsFeed.header.timestamp);
  const { alerts } = buildAlerts(alertsFeed, hurstbridge.config, hurstbridge.data, now);

  it("keeps the line's alerts once each, with the stations they name", () => {
    const headers = alerts.map((a) => a.header);
    expect(new Set(headers.map((h, i) => h + alerts[i].description)).size).toBe(alerts.length);
    const buses = alerts.find((a) => a.header.includes("Buses replace trains between Heidelberg"))!;
    expect(buses.effect).toBe("MODIFIED_SERVICE");
    expect(buses.stations).toEqual(expect.arrayContaining(["heidelberg", "greensborough"]));
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
