import { describe, expect, it } from "vitest";
import stationData from "../data/stations.json";
import { LINE_BY_ID, LINES } from "../shared/network";
import { NETWORKS } from "../src/networks";
import { networkGeometry, SPACING } from "../src/schematic";

describe("network", () => {
  it("has timetable data for every station on the map", () => {
    for (const line of LINES)
      for (const s of line.stations) expect(stationData.stations, `${line.name}: ${s.name}`).toHaveProperty(s.id);
  });

  it("draws a line on its own along its stations", () => {
    const hurstbridge = LINE_BY_ID.hurstbridge;
    const geo = networkGeometry([hurstbridge], LINES, NETWORKS.melbourne).get("hurstbridge")!;
    const eltham = hurstbridge.stations.findIndex((s) => s.id === "eltham");
    expect(geo.stations[eltham]).toEqual([hurstbridge.stations[eltham].x, hurstbridge.stations[eltham].y]);
  });

  it("draws lines of different groups side by side where they share track, and one group as one line", () => {
    const [hbe, mdd, lil] = ["hurstbridge", "mernda", "lilydale"].map((id) => LINE_BY_ID[id]);
    const geo = networkGeometry([hbe, mdd, lil], LINES, NETWORKS.melbourne);
    const at = (line: string, station: string) =>
      geo.get(line)!.stations[LINE_BY_ID[line].stations.findIndex((s) => s.id === station)];
    expect(at("hurstbridge", "flagstaff")).toEqual(at("mernda", "flagstaff"));
    const [a, b] = [at("hurstbridge", "flagstaff"), at("lilydale", "flagstaff")];
    expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeCloseTo(SPACING);
  });
});
