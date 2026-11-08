import { describe, expect, it } from "vitest";
import { distance, nearest } from "../src/useNearestStation";
import { lines } from "../shared/lines";

describe("nearest station", () => {
  const stations = lines.hurstbridge.data.stations;

  it("measures distances in metres", () => {
    // Flinders Street to Southern Cross is a little over a kilometre.
    const m = distance(stations["flinders-street"], stations["southern-cross"]);
    expect(m).toBeGreaterThan(900);
    expect(m).toBeLessThan(1500);
  });

  it("picks the closest station", () => {
    // Eltham's main street, a few hundred metres from the station.
    expect(nearest({ lat: -37.7135, lon: 145.1488 }, stations)?.id).toBe("eltham");
    expect(nearest({ lat: stations.heidelberg.lat, lon: stations.heidelberg.lon }, stations)).toEqual({
      id: "heidelberg",
      metres: 0,
    });
  });

  it("skips stations with no location", () => {
    expect(nearest({ lat: -37.7135, lon: 145.1488 }, { eltham: undefined, heidelberg: stations.heidelberg })?.id).toBe(
      "heidelberg",
    );
  });
});

describe("nearest per line", () => {
  it("gives each line's nearest, the nearest of all first, without repeats", async () => {
    const { nearestPerLine } = await import("../src/useNearestStation");
    const here = { lat: -37.81, lon: 144.96 };
    const a = { lat: -37.811, lon: 144.96 };
    const b = { lat: -37.82, lon: 144.96 };
    const c = { lat: -37.83, lon: 144.96 };
    expect(nearestPerLine(here, [{ b, c }, { a, b }, { b }])).toMatchObject({ id: "a", ids: ["a", "b"] });
    expect(nearestPerLine(here, [])).toBeNull();
  });
});
