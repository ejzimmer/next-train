import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeFeed } from "../shared/feed";
import { buildDepartures } from "../shared/departures";
import { directionFromBearing, placeOnLine } from "../shared/position";
import { buildVehicles } from "../shared/vehicles";
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
