/**
 * Helpers for writing a network schematic: stations are placed with `at`, or as walks from a station in one
 * of eight directions, so a branch can be moved by changing where it starts. Each network makes its own.
 */
import type { City, LineConfig, SchematicStation } from "./types";

export type Pt = [number, number];
type Label = SchematicStation["label"];
export type Dir = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";

const STEP: Record<Dir, Pt> = {
  N: [0, -1],
  NE: [1, -1],
  E: [1, 0],
  SE: [1, 1],
  S: [0, 1],
  SW: [-1, 1],
  W: [-1, 0],
  NW: [-1, -1],
};

export const stationId = (name: string) => name.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");

/** Labels for a horizontal run take turns above and below; an array gives each station's. */
type LegLabel = Label | "tb" | "bt" | Label[];

/**
 * `gtfsNames` are GTFS stop names that differ from the name on the map. `prefix` goes in front of the ids
 * of stations placed through `ns(prefix)`, for stops that share a name with a station on another mode
 * (Town Hall light rail stop and Town Hall station).
 */
export function createLayout(gtfsNames: Record<string, string> = {}) {
  const places: Record<string, Omit<SchematicStation, "via">> = {};
  /** Bends in the drawn track between two stations, keyed "from>to" in the order written. */
  const bends = new Map<string, Pt[]>();

  function ns(prefix = "") {
    const id = (name: string) => prefix + stationId(name);
    const place = (name: string) => {
      const s = places[id(name)];
      if (!s) throw new Error(`${name} isn't on the map yet`);
      return s;
    };

    function at(name: string, x: number, y: number, label: Label) {
      const key = prefix + name;
      places[id(name)] = { id: id(name), name, ...(gtfsNames[key] && { gtfsName: gtfsNames[key] }), x, y, label };
    }

    /** Moves a station's label, e.g. off a line that leaves at an angle; `nudge` shifts it a few px further. */
    function relabel(name: string, label: Label, nudge?: Pt) {
      const s = place(name);
      s.label = label;
      if (nudge) s.nudge = nudge;
    }

    function bend(from: string, to: string, via: Pt[]) {
      bends.set(`${id(from)}>${id(to)}`, via);
    }

    /**
     * Places `names` one after another from station `from`, `step` px apart along `dir`
     * (diagonal steps are `step` px on each axis). `turn` px past the previous station the track
     * bends, so a leg can start at an angle to the one before it.
     */
    function walk(from: string, ...legs: { dir: Dir; step: number; label: LegLabel; names: string[]; turn?: number }[]) {
      let prev = place(from);
      let [x, y] = [prev.x, prev.y];
      let lastDir: Dir | null = null;
      for (const { dir, step, label, names, turn } of legs) {
        const [dx, dy] = STEP[dir];
        names.forEach((name, i) => {
          let via: Pt[] | undefined;
          if (i === 0 && lastDir && lastDir !== dir) {
            const [lx, ly] = STEP[lastDir];
            const t = turn ?? step / 2;
            const corner: Pt = [x + lx * t, y + ly * t];
            via = [corner];
            [x, y] = [corner[0] + dx * (step - t), corner[1] + dy * (step - t)];
          } else {
            [x, y] = [x + dx * step, y + dy * step];
          }
          const l: Label = Array.isArray(label)
            ? label[i]
            : label === "tb"
              ? i % 2 ? "b" : "t"
              : label === "bt"
                ? i % 2 ? "t" : "b"
                : label;
          at(name, x, y, l);
          if (via) bend(prev.name, name, via);
          prev = place(name);
        });
        lastDir = dir;
      }
    }

    return { at, relabel, bend, walk, place, id };
  }

  /** Bends between two stations (by id), whichever way round they were written. */
  function bendsBetween(a: string, b: string): Pt[] {
    const forward = bends.get(`${a}>${b}`);
    if (forward) return forward;
    return [...(bends.get(`${b}>${a}`) ?? [])].reverse();
  }

  function station(id: string): SchematicStation {
    const s = places[id];
    if (!s) throw new Error(`${id} isn't on the map`);
    return { ...s };
  }

  /** Lines from their stations and extra track (by name, in the line's `prefix` namespace) and group colours. */
  function lines(city: City, defs: LineDef[], groups: Record<string, { colour: string; text: string }>): LineConfig[] {
    const ids = (def: LineDef) => def.stations.map((name) => (def.prefix ?? "") + stationId(name));
    // Departures show a platform number at stations on more than one line (or switch, where branches share one).
    const switches = new Map<string, Set<string>>();
    for (const def of defs)
      for (const id of ids(def)) switches.set(id, (switches.get(id) ?? new Set()).add(def.switchId ?? def.id ?? stationId(def.name)));
    return defs.map((def) => {
      const stations = ids(def).map(station);
      stations.forEach((s, i) => {
        const via = i > 0 ? bendsBetween(stations[i - 1].id, s.id) : [];
        if (via.length) s.via = via;
      });
      const id = (name: string) => (def.prefix ?? "") + stationId(name);
      const lineId = def.id ?? stationId(def.name);
      return {
        id: lineId,
        city,
        mode: def.mode,
        name: def.name,
        switchId: def.switchId ?? lineId,
        colour: groups[def.group].colour,
        textColour: groups[def.group].text,
        group: def.group,
        routeIdMatch: def.routeIdMatch,
        cityLoop: def.cityLoop && [id(def.cityLoop[0]), id(def.cityLoop[1])],
        platformStations: stations.filter((s) => switches.get(s.id)!.size > 1).map((s) => s.id),
        stations,
        track: (def.track ?? []).map(([from, to]) => ({ from: id(from), to: id(to), via: bendsBetween(id(from), id(to)) })),
      };
    });
  }

  return { ns, places, bendsBetween, station, lines };
}

export interface LineDef {
  name: string;
  /** Defaults to the name as an id. */
  id?: string;
  /** Lines sharing a switch are shown and hidden together. Defaults to the line's own id. */
  switchId?: string;
  mode: LineConfig["mode"];
  routeIdMatch: string[];
  group: string;
  /** Station names, in order; `prefix` is the namespace they were placed in. */
  stations: string[];
  prefix?: string;
  /** Track between stations that aren't next to each other in `stations`, e.g. trains running direct, not via the City Loop. */
  track?: [string, string][];
  cityLoop?: [string, string];
}
