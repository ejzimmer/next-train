import type { SchematicStation } from "../shared/types";

type Pt = [number, number];

/** Points of the drawn line from station `i` to station `i + 1`, bends included. */
function segmentPoints(stations: SchematicStation[], i: number): Pt[] {
  const a = stations[i];
  const b = stations[i + 1];
  return [[a.x, a.y], ...(b.via ?? []), [b.x, b.y]];
}

/** SVG path data for the whole line. */
export function linePath(stations: SchematicStation[]): string {
  const pts: Pt[] = [[stations[0].x, stations[0].y]];
  for (let i = 0; i < stations.length - 1; i++) pts.push(...segmentPoints(stations, i).slice(1));
  return pts.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" ");
}

/** Point `fraction` of the way along segment `i`, with the outbound heading in degrees. */
export function pointOnLine(stations: SchematicStation[], i: number, fraction: number) {
  const pts = segmentPoints(stations, i);
  const lens = pts.slice(1).map((p, k) => Math.hypot(p[0] - pts[k][0], p[1] - pts[k][1]));
  let remaining = fraction * lens.reduce((a, b) => a + b, 0);
  for (let k = 0; k < lens.length; k++) {
    if (remaining <= lens[k] || k === lens.length - 1) {
      const t = lens[k] === 0 ? 0 : Math.min(1, remaining / lens[k]);
      const [x0, y0] = pts[k];
      const [x1, y1] = pts[k + 1];
      return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, angle: (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI };
    }
    remaining -= lens[k];
  }
  return { x: pts[0][0], y: pts[0][1], angle: 0 };
}
