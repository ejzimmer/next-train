/**
 * Which buses to draw: those linking stations and tram stops on lines that are showing, and not just running
 * alongside one of them. Each is drawn only through those links.
 */
import network from "../data/buses/network.json";
import type { BusDto, BusLink, BusNetworkData } from "../shared/buses";
import type { LineConfig } from "../shared/types";

const data = network as unknown as BusNetworkData;

export interface ShownBus {
  id: string;
  name: string;
  colour: string;
  /** Each direction's links on the lines showing, in order along the route. */
  dirs: { dir: number; dest: string; links: BusLink[] }[];
}

/** The buses linking the places on `lines`. */
export function connectingBuses(lines: LineConfig[]): ShownBus[] {
  const linesAt = new Map<string, Set<string>>();
  for (const line of lines)
    for (const s of line.stations) linesAt.set(s.id, (linesAt.get(s.id) ?? new Set()).add(line.switchId));
  const out: ShownBus[] = [];
  for (const r of data.routes) {
    const dirs = r.dirs
      .map((d) => ({ dir: d.dir, dest: d.dest, links: d.links.filter((l) => linesAt.has(l.place)) }))
      .filter((d) => d.links.length >= 2);
    if (!dirs.length) continue;
    const places = new Set(dirs.flatMap((d) => d.links.map((l) => l.place)));
    // Not when one line has every place it links: a bus alongside that line.
    const sets = [...places].map((p) => linesAt.get(p)!);
    const oneLine = [...sets[0]].some((line) => sets.every((s) => s.has(line)));
    if (oneLine || places.size < 2) continue;
    out.push({
      id: r.id,
      name: r.name,
      colour: r.colour,
      dirs,
    });
  }
  return out;
}

/**
 * Where a bus is between the links drawn for its direction: the link it last passed and how far on to the
 * next. Null when it's before the first or past the last.
 */
export function busBetween(bus: BusDto, route: ShownBus): { from: string; to: string; f: number } | null {
  const links = route.dirs.find((d) => d.dir === bus.dir)?.links;
  if (!links) return null;
  for (let i = 1; i < links.length; i++) {
    const [a, b] = [links[i - 1], links[i]];
    if (bus.d >= a.d && bus.d <= b.d) return { from: a.place, to: b.place, f: b.d > a.d ? (bus.d - a.d) / (b.d - a.d) : 0 };
  }
  return null;
}
