import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import stationData from "../data/brisbane/stations.json";
import { buildAlerts } from "../shared/alerts";
import { LINE_BY_ID, LINES } from "../shared/brisbane";
import { buildDepartures } from "../shared/departures";
import { decodeFeed } from "../shared/feed";
import { cities } from "../shared/lines";
import { isLineRoute } from "../shared/routes";
import { serviceMidnight } from "../shared/schedule";
import { TIME_ZONES } from "../shared/time";
import { buildVehicles } from "../shared/vehicles";
import { disruptedDays } from "../src/calendar";

// Snapshots of Translink's live rail feeds (and its alerts for every mode), saved on 2026-11-01 around 6:15pm in Brisbane.
const feed = (name: string) => decodeFeed(readFileSync(new URL(`./fixtures/brisbane/${name}.pb`, import.meta.url)));
const vehiclesFeed = feed("vehicle-positions");
const tripsFeed = feed("trip-updates");
const alertsFeed = feed("service-alerts");
const brisbane = cities.brisbane;
const NOW = 1793520860;

describe("Brisbane", () => {
  it("has data for every station on the map", () => {
    for (const line of LINES)
      for (const s of line.stations) expect(stationData.stations, `${line.name}: ${s.name}`).toHaveProperty(s.id);
  });

  it("puts a through route on the lines at both its ends, and nothing else", () => {
    const on = (routeId: string) => LINES.filter((l) => isLineRoute(routeId, l)).map((l) => l.id);
    expect(on("FGBN-5212")).toEqual(["beenleigh", "ferny-grove"]);
    expect(on("BRDB-5212")).toEqual(["doomben"]);
    expect(on("RWIP-5212")).toEqual(["ipswich-rosewood"]);
    expect(on("GYSP-5212")).toEqual(["sunshine-coast", "springfield"]);
    // Gold Coast light rail and buses.
    expect(on("L1-5199")).toEqual([]);
    expect(on("600-5199")).toEqual([]);
  });

  it("places every train in the feed on a line", () => {
    const placed = new Set(Object.values(brisbane).flatMap(({ config, data }) => buildVehicles(vehiclesFeed, config, data).vehicles.map((v) => v.id)));
    const reported = vehiclesFeed.entity.filter((e) => e.vehicle?.position).map((e) => e.vehicle!.vehicle!.id);
    expect(reported.length).toBeGreaterThan(40);
    expect(reported.filter((id) => !placed.has(id!))).toEqual([]);
  });

  it("lists departures with their platforms in the city", () => {
    const { config, data } = brisbane["ferny-grove"];
    const deps = buildDepartures(tripsFeed, config, data, NOW).stations["roma-street"];
    expect(deps.length).toBeGreaterThan(0);
    expect(deps.every((d) => d.platform)).toBe(true);
  });

  it("gives a line its own alerts, not those of lines its trains run through to", () => {
    const alerts = (id: string) => buildAlerts(alertsFeed, LINE_BY_ID[id], brisbane[id].data, NOW).alerts;
    const closures = alerts("shorncliffe").find((a) => a.header === "Evening track closures - Shorncliffe line")!;
    expect(closures.kind).toBe("suspended");
    expect(closures.stretch).toEqual({ from: "northgate", to: "shorncliffe" });
    expect(alerts("cleveland").some((a) => a.header.includes("Shorncliffe line"))).toBe(false);
  });

  it("keeps Brisbane time, without daylight saving", () => {
    // Midnight on 1 November is 14:00 UTC the day before in Brisbane, 13:00 in Melbourne.
    expect(serviceMidnight("20261101", TIME_ZONES.brisbane)).toBe(Date.UTC(2026, 9, 31, 14) / 1000);
    expect(serviceMidnight("20261101")).toBe(Date.UTC(2026, 9, 31, 13) / 1000);
    // 10:30pm to 3am in Brisbane: one night.
    const night = { start: Date.UTC(2026, 10, 2, 12, 30) / 1000, end: Date.UTC(2026, 10, 2, 17) / 1000 };
    expect(Object.fromEntries(disruptedDays([night], NOW, TIME_ZONES.brisbane))).toEqual({ "2026-11-02": "night" });
  });
});
