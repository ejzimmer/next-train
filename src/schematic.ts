import { segmentCount, segmentEnds } from "../shared/routes";
import type { LineConfig } from "../shared/types";

export type Pt = [number, number];

/** Distance between the centres of lines drawn side by side. */
export const SPACING = 10;
/** Tram routes are drawn thinner, and closer together. */
export const TRAM_SPACING = 4;

export interface LineGeometry {
  /** The drawn points of each segment (see segmentEnds), shifted sideways where lines run side by side. */
  segments: Pt[][];
  /** Where each station sits on this line. */
  stations: Pt[];
}

const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Points of segment `i` as laid out on the map, bends included, before any sideways shift. */
function rawPoints(line: LineConfig, i: number): Pt[] {
  const n = line.stations.length - 1;
  const [a, b] = segmentEnds(line, i).map((id) => line.stations.find((s) => s.id === id)!);
  const via = i < n ? (b.via ?? []) : line.track[i - n].via;
  return [[a.x, a.y], ...via, [b.x, b.y]];
}

/**
 * Shifts a polyline sideways by a distance per gap (to the right of the direction of travel),
 * mitring the corners. Returns each gap's start and end; where two gaps' shifts don't meet
 * (a straight run whose shift changes), the end of one and the start of the next differ.
 */
function offsetPolyline(pts: Pt[], shift: number[]): { a: Pt; b: Pt }[] {
  const dirs = pts.slice(1).map((p, j) => {
    const dx = p[0] - pts[j][0];
    const dy = p[1] - pts[j][1];
    const len = Math.hypot(dx, dy) || 1;
    return [dx / len, dy / len] as Pt;
  });
  const shifted = (j: number, k: number): Pt => [pts[j][0] - dirs[k][1] * shift[k], pts[j][1] + dirs[k][0] * shift[k]];
  const gaps = dirs.map((_, k) => ({ a: shifted(k, k), b: shifted(k + 1, k) }));
  for (let j = 1; j < dirs.length; j++) {
    const [u1, u2] = [dirs[j - 1], dirs[j]];
    const cross = u1[0] * u2[1] - u1[1] * u2[0];
    if (Math.abs(cross) < 1e-6) continue;
    const p1 = gaps[j - 1].b;
    const p2 = gaps[j].a;
    const t = ((p2[0] - p1[0]) * u2[1] - (p2[1] - p1[1]) * u2[0]) / cross;
    const x: Pt = [p1[0] + u1[0] * t, p1[1] + u1[1] * t];
    // Very sharp corners would mitre far out: leave those as a jog.
    if (Math.hypot(x[0] - pts[j][0], x[1] - pts[j][1]) > 3 * Math.max(Math.abs(shift[j - 1]), Math.abs(shift[j])) + 1) continue;
    gaps[j - 1].b = x;
    gaps[j].a = x;
  }
  return gaps;
}

const same = (p: Pt, q: Pt) => Math.abs(p[0] - q[0]) < 0.01 && Math.abs(p[1] - q[1]) < 0.01;

/**
 * Where each visible line is drawn. Lines of different groups that share track run side by side,
 * in group order (`order.groupOrder`, or `order.edgeOrder` on a stretch where that would cross them over); lines of
 * one group share one path. `all` fixes each stretch's direction, so the order doesn't flip as lines are switched
 * on and off.
 */
export function networkGeometry(
  visible: LineConfig[],
  all: LineConfig[],
  order: { groupOrder: string[]; edgeOrder: Record<string, string[]> },
): Map<string, LineGeometry> {
  const forward = new Map<string, string>();
  for (const line of all)
    for (let i = 0; i < segmentCount(line); i++) {
      const [a, b] = segmentEnds(line, i);
      if (!forward.has(edgeKey(a, b))) forward.set(edgeKey(a, b), a);
    }
  const groupsOn = new Map<string, Set<string>>();
  for (const line of visible)
    for (let i = 0; i < segmentCount(line); i++) {
      const key = edgeKey(...segmentEnds(line, i));
      groupsOn.set(key, (groupsOn.get(key) ?? new Set()).add(line.group));
    }
  const shiftOf = (line: LineConfig, i: number) => {
    const [a, b] = segmentEnds(line, i);
    const key = edgeKey(a, b);
    const present = groupsOn.get(key)!;
    const groups = (order.edgeOrder[key] ?? order.groupOrder).filter((g) => present.has(g));
    const k = groups.indexOf(line.group);
    const d = (k - (groups.length - 1) / 2) * (line.mode === "tram" ? TRAM_SPACING : SPACING);
    return forward.get(key) === a ? d : -d;
  };

  const result = new Map<string, LineGeometry>();
  for (const line of visible) {
    const n = line.stations.length - 1;
    // The main run of stations as one polyline, so corners at stations are mitred too.
    const pts: Pt[] = [];
    const shift: number[] = [];
    const gapSegment: number[] = [];
    for (let i = 0; i < n; i++) {
      const raw = rawPoints(line, i);
      if (i === 0) pts.push(raw[0]);
      pts.push(...raw.slice(1));
      for (let k = 1; k < raw.length; k++) {
        shift.push(shiftOf(line, i));
        gapSegment.push(i);
      }
    }
    const gaps = offsetPolyline(pts, shift);
    const segments: Pt[][] = Array.from({ length: n }, () => []);
    gaps.forEach(({ a, b }, k) => {
      const seg = segments[gapSegment[k]];
      if (!seg.length || !same(seg[seg.length - 1], a)) seg.push(a);
      seg.push(b);
    });
    const stations: Pt[] = line.stations.map((_, i) => {
      if (i === 0) return segments[0][0];
      const end = segments[i - 1][segments[i - 1].length - 1];
      const start = segments[i]?.[0] ?? end;
      return [(end[0] + start[0]) / 2, (end[1] + start[1]) / 2];
    });
    for (let t = 0; t < line.track.length; t++) {
      const raw = rawPoints(line, n + t);
      const g = offsetPolyline(raw, raw.slice(1).map(() => shiftOf(line, n + t)));
      segments.push([g[0].a, ...g.map((x) => x.b)]);
    }
    result.set(line.id, { segments, stations });
  }
  return result;
}

/** SVG path data through `points`. */
export function pathOf(points: Pt[]): string {
  return points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

/** Point `fraction` of the way along `pts`, with the heading in degrees. */
export function pointAlong(pts: Pt[], fraction: number) {
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
