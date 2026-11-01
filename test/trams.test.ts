import { describe, expect, it } from "vitest";
import { cities } from "../shared/lines";
import { isLineRoute, isLineTrip } from "../shared/routes";
import { melbourneTramType } from "../shared/trainType";
import { TRAM_LINES } from "../shared/trams";
import { NETWORKS } from "../src/networks";
import { networkGeometry, TRAM_SPACING } from "../src/schematic";

const route = (n: string) => TRAM_LINES.find((l) => l.id === `tram-${n}`)!;

describe("trams", () => {
  it("has every route, each with its stops placed and located", () => {
    expect(TRAM_LINES.length).toBeGreaterThanOrEqual(20);
    for (const line of TRAM_LINES) {
      expect(line.stations.length, line.name).toBeGreaterThan(5);
      for (const s of line.stations) {
        expect(Number.isFinite(s.x) && Number.isFinite(s.y), `${line.name}: ${s.name}`).toBe(true);
        expect(cities.melbourne[line.id].data.stations[s.id]?.stopIds.length, `${line.name}: ${s.name}`).toBeGreaterThan(0);
      }
    }
  });

  it("knows each route's trips, with where they're headed", () => {
    const { data } = cities.melbourne["tram-109"];
    const trips = Object.values(data.trips);
    expect(trips.length).toBeGreaterThan(100);
    expect(trips.some((t) => t.dir === "outbound")).toBe(true);
    expect(trips.some((t) => t.dir === "citybound")).toBe(true);
    expect(trips.every((t) => typeof t.dest === "string" && t.dest.length > 0)).toBe(true);
  });

  it("matches a route by its number only", () => {
    expect(isLineRoute("aus:vic:vic-03-1:", route("1"))).toBe(true);
    expect(isLineRoute("1", route("1"))).toBe(true);
    expect(isLineRoute("aus:vic:vic-03-11:", route("1"))).toBe(false);
    expect(isLineRoute("aus:vic:vic-03-109:", route("1"))).toBe(false);
    expect(isLineRoute("aus:vic:vic-03-109:", route("109"))).toBe(true);
    expect(isLineRoute("aus:vic:vic-02-HBE:", route("1"))).toBe(false);
  });

  it("takes a trip without a route as the route whose timetable has it", () => {
    const { config, data } = cities.melbourne["tram-96"];
    const tripId = Object.keys(data.trips)[0];
    expect(isLineTrip({ tripId }, config, data)).toBe(true);
    expect(isLineTrip({ tripId }, route("86"), cities.melbourne["tram-86"].data)).toBe(false);
  });

  it("names a tram's class from its fleet number", () => {
    expect(melbourneTramType("6011")).toEqual({ type: "E-class", cars: 1, carNumbers: ["6011"] });
    expect(melbourneTramType("Z3-180").type).toBe("Z3-class");
    expect(melbourneTramType("2035").type).toBe("B-class");
    expect(melbourneTramType("9999").type).toBeNull();
  });

  it("draws routes sharing a street side by side, closer than the trains", () => {
    const [a, b] = [route("86"), route("96")];
    const geo = networkGeometry([a, b], NETWORKS.melbourne.lines, NETWORKS.melbourne);
    // A stop both run through.
    const shared = a.stations.find((s, i) => i > 0 && i < a.stations.length - 1 && b.stations.some((t) => t.id === s.id))!;
    expect(shared).toBeDefined();
    const pa = geo.get(a.id)!.stations[a.stations.indexOf(shared)];
    const pb = geo.get(b.id)!.stations[b.stations.findIndex((s) => s.id === shared.id)];
    expect(Math.hypot(pa[0] - pb[0], pa[1] - pb[1])).toBeCloseTo(TRAM_SPACING, 0);
  });
});
