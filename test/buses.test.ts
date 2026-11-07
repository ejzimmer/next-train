import { describe, expect, it } from "vitest";
import routes from "../data/buses/routes.json";
import type { BusRoutesData } from "../shared/buses";
import { project } from "../shared/busVehicles";
import { cities } from "../shared/lines";
import { busBetween, connectingBuses } from "../src/buses";

const data = routes as unknown as BusRoutesData;
const line = (id: string) => cities.melbourne[id].config;

describe("connecting buses", () => {
  it("shows buses linking two lines, through just their links on those lines", () => {
    const buses = connectingBuses([line("hurstbridge"), line("mernda")]);
    expect(buses.length).toBeGreaterThan(0);
    const places = new Set([...line("hurstbridge").stations, ...line("mernda").stations].map((s) => s.id));
    for (const b of buses) for (const d of b.dirs) for (const l of d.links) expect(places.has(l.place)).toBe(true);
  });

  it("leaves out buses that only run alongside one line", () => {
    const one = connectingBuses([line("hurstbridge")]);
    expect(one).toEqual([]);
  });

  it("puts a bus between the links it's travelling between", () => {
    const [bus] = connectingBuses([line("hurstbridge"), line("mernda")]);
    const [a, b] = bus.dirs[0].links;
    const at = busBetween({ id: "x", route: bus.id, dir: bus.dirs[0].dir, d: (a.d + b.d) / 2, timestamp: 0 }, bus);
    expect(at).toEqual({ from: a.place, to: b.place, f: 0.5 });
  });
});

describe("placing buses", () => {
  it("finds how far along its route a bus is from where it is", () => {
    const pts = data.routes["903"].dirs[0].pts;
    const [lat, lon, d] = pts[10];
    const p = project(pts, lat, lon)!;
    expect(p.off).toBeLessThan(1);
    expect(p.d).toBeCloseTo(d, 0);
  });

});
