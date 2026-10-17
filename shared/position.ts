import type { Direction, LineConfig, LineData } from "./types";

interface Point { x: number; y: number }

// Equirectangular projection in metres: accurate enough over one train line.
function project(lat: number, lon: number, lat0: number): Point {
  const R = 6371000;
  return { x: ((lon * Math.PI) / 180) * R * Math.cos((lat0 * Math.PI) / 180), y: ((lat * Math.PI) / 180) * R };
}

export interface Placement {
  segment: number;
  fraction: number;
  /** Distance from the line in metres. */
  offLine: number;
}

/**
 * Snaps a lat/lon to the nearest point on the straight segments between consecutive stations.
 * Returns null when the line has fewer than two stations with coordinates.
 */
export function placeOnLine(lat: number, lon: number, line: LineConfig, data: LineData): Placement | null {
  const pts = line.stations.map((s) => data.stations[s.id]);
  if (pts.length < 2 || pts.some((p) => !p)) return null;
  const lat0 = pts[0].lat;
  const p = project(lat, lon, lat0);
  let best: Placement | null = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = project(pts[i].lat, pts[i].lon, lat0);
    const b = project(pts[i + 1].lat, pts[i + 1].lon, lat0);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    const d = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    if (!best || d < best.offLine) best = { segment: i, fraction: t, offLine: d };
  }
  return best;
}

/** Bearing in degrees (0 = north) from station `segment` to the next one, i.e. the outbound direction. */
export function segmentBearing(segment: number, line: LineConfig, data: LineData): number {
  const a = data.stations[line.stations[segment].id];
  const b = data.stations[line.stations[segment + 1].id];
  const p = project(a.lat, a.lon, a.lat);
  const q = project(b.lat, b.lon, a.lat);
  return ((Math.atan2(q.x - p.x, q.y - p.y) * 180) / Math.PI + 360) % 360;
}

export function directionFromBearing(vehicleBearing: number, outboundBearing: number): Direction {
  const diff = Math.abs(((vehicleBearing - outboundBearing + 540) % 360) - 180);
  return diff < 90 ? "outbound" : "citybound";
}
