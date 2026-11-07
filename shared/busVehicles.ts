/** Placing live buses on their routes, by where they are (projected onto the route's stops). */
import type { BusDto, BusRoutesData } from "./buses";
import { toNum, type FeedMessage } from "./feed";

type Pt = [number, number, number];

const toXY = (lat: number, lon: number, lat0: number): [number, number] => [
  lon * 111_320 * Math.cos((lat0 * Math.PI) / 180),
  lat * 110_570,
];

/** How far (m) a bus can be from its route and still be put on it. */
const OFF_ROUTE = 400;

/**
 * Where along `pts` the point is (metres), how far off it, and the way the route heads there (degrees from
 * north, clockwise).
 */
export function project(pts: Pt[], lat: number, lon: number): { d: number; off: number; heading: number } | null {
  let best: { d: number; off: number; heading: number } | null = null;
  const [px, py] = toXY(lat, lon, lat);
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = toXY(pts[i - 1][0], pts[i - 1][1], lat);
    const [bx, by] = toXY(pts[i][0], pts[i][1], lat);
    const [dx, dy] = [bx - ax, by - ay];
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
    const off = Math.hypot(ax + dx * t - px, ay + dy * t - py);
    if (!best || off < best.off) {
      const heading = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
      best = { d: pts[i - 1][2] + (pts[i][2] - pts[i - 1][2]) * t, off, heading };
    }
  }
  return best;
}

const turn = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

/** The live buses on the given routes, each on the direction it's heading. */
export function liveBuses(feed: FeedMessage, routes: BusRoutesData["routes"], wanted: Set<string>): BusDto[] {
  const out = new Map<string, BusDto>();
  for (const e of feed.entity) {
    const v = e.vehicle;
    const route = v?.trip?.routeId?.trim();
    const pos = v?.position;
    if (!v || !route || !pos || !wanted.has(route) || !routes[route]) continue;
    const bearing = pos.bearing != null ? Number(pos.bearing) : null;
    const fits = routes[route].dirs
      .map((dir) => ({ dir: dir.dir, p: project(dir.pts, pos.latitude, pos.longitude) }))
      .filter((x): x is { dir: number; p: NonNullable<ReturnType<typeof project>> } => !!x.p && x.p.off <= OFF_ROUTE)
      // Heading the way the route goes counts for more than being a little closer to it.
      .sort((a, b) => score(a.p, bearing) - score(b.p, bearing));
    const best = fits[0];
    if (!best) continue;
    const bus = {
      id: `bus:${v.vehicle?.id ?? e.id}`,
      route,
      dir: best.dir,
      d: Math.round(best.p.d),
      timestamp: toNum(v.timestamp) || toNum(feed.header.timestamp),
    };
    // A bus can be reported more than once (on its last trip and its next): its newest report.
    const kept = out.get(bus.id);
    if (!kept || kept.timestamp < bus.timestamp) out.set(bus.id, bus);
  }
  return [...out.values()];
}

const score = (p: { off: number; heading: number }, bearing: number | null) =>
  p.off + (bearing == null ? 0 : turn(p.heading, bearing) > 90 ? 1000 : 0);
