/**
 * Turns tram routes placed at their (bent) real positions into a straight-line diagram like the train map.
 *
 * The routes make a graph of stops. Where routes join, part or end, a stop is a junction, and it keeps its
 * place (on a grid). Between junctions, a stretch of street is simplified to its main turns, and each run
 * between turns becomes one or two straight legs at 45° or 90°. Stops are spaced along the legs as they
 * are along the street.
 */

export type Pt = [number, number];

/** Junctions and turns are put on a grid this many px apart. */
const GRID = 6;
/** How far (px) a street can wander from a straight run before it counts as a turn. */
const TURN = 14;
/** A run whose smaller side is this short (px) is drawn as one straight leg, slightly off the angle. */
const NEAR_STRAIGHT = 5;

const snap = ([x, y]: Pt): Pt => [Math.round(x / GRID) * GRID, Math.round(y / GRID) * GRID];
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Indices of the points Douglas-Peucker keeps at tolerance `tol`. */
function simplify(pts: Pt[], tol: number): number[] {
  const keep = new Set([0, pts.length - 1]);
  const go = (i: number, j: number) => {
    let best = -1;
    let max = tol;
    const [a, b] = [pts[i], pts[j]];
    const len = dist(a, b) || 1;
    for (let k = i + 1; k < j; k++) {
      const p = pts[k];
      const d = Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / len;
      if (d > max) [max, best] = [d, k];
    }
    if (best >= 0) {
      keep.add(best);
      go(i, best);
      go(best, j);
    }
  };
  go(0, pts.length - 1);
  return [...keep].sort((x, y) => x - y);
}

/**
 * The legs from `a` to `b` at 45°/90°: one when they line up, else a diagonal and a straight, with the corner
 * on whichever side is closer to `towards` (where the street actually goes).
 */
function legs(a: Pt, b: Pt, towards: Pt): Pt[] {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const [ax, ay] = [Math.abs(dx), Math.abs(dy)];
  if (Math.min(ax, ay) <= NEAR_STRAIGHT || Math.abs(ax - ay) <= NEAR_STRAIGHT) return [a, b];
  const d = Math.min(ax, ay);
  const diag: Pt = [Math.sign(dx) * d, Math.sign(dy) * d];
  const diagonalFirst: Pt = [a[0] + diag[0], a[1] + diag[1]];
  const straightFirst: Pt = [b[0] - diag[0], b[1] - diag[1]];
  const corner = dist(diagonalFirst, towards) <= dist(straightFirst, towards) ? diagonalFirst : straightFirst;
  return [a, corner, b];
}

/** Point `t` (0-1) of the way along `pts`, and which leg it falls on. */
function along(pts: Pt[], t: number): { p: Pt; leg: number } {
  const lens = pts.slice(1).map((p, k) => dist(p, pts[k]));
  let rest = t * lens.reduce((s, l) => s + l, 0);
  for (let k = 0; k < lens.length; k++) {
    if (rest <= lens[k] || k === lens.length - 1) {
      const f = lens[k] ? Math.min(1, rest / lens[k]) : 0;
      return { p: [pts[k][0] + (pts[k + 1][0] - pts[k][0]) * f, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * f], leg: k };
    }
    rest -= lens[k];
  }
  return { p: pts[0], leg: 0 };
}

const round = ([x, y]: Pt): Pt => [Math.round(x * 10) / 10, Math.round(y * 10) / 10];

/**
 * Where each stop goes, and the bends between neighbouring stops (keyed "from>to", in the order the
 * stretch was walked; read the other way round, they're reversed).
 */
export function straightLines(at: Record<string, Pt>, routes: string[][]): { at: Record<string, Pt>; bends: Record<string, Pt[]> } {
  const next = new Map<string, Set<string>>();
  const routesOn = new Map<string, Set<number>>();
  const ends = new Set<string>();
  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  routes.forEach((stops, r) => {
    ends.add(stops[0]);
    ends.add(stops[stops.length - 1]);
    for (let i = 1; i < stops.length; i++) {
      const [a, b] = [stops[i - 1], stops[i]];
      if (a === b) continue;
      next.set(a, (next.get(a) ?? new Set()).add(b));
      next.set(b, (next.get(b) ?? new Set()).add(a));
      routesOn.set(key(a, b), (routesOn.get(key(a, b)) ?? new Set()).add(r));
    }
  });
  const sameRoutes = (x: Set<number>, y: Set<number>) => x.size === y.size && [...x].every((r) => y.has(r));
  const isJunction = (id: string) => {
    const n = [...(next.get(id) ?? [])];
    return ends.has(id) || n.length !== 2 || !sameRoutes(routesOn.get(key(id, n[0]))!, routesOn.get(key(id, n[1]))!);
  };

  // The diagram's nodes: junctions, and the main turns along the stretches between them.
  const node: Record<string, Pt> = {};
  for (const id of next.keys()) if (isJunction(id)) node[id] = [...at[id]];

  const walked = new Set<string>();
  const walk = (from: string, first: string) => {
    const chain = [from, first];
    while (!(chain[chain.length - 1] in node)) {
      const here = chain[chain.length - 1];
      const prev = chain[chain.length - 2];
      const onward = [...next.get(here)!].find((n) => n !== prev);
      if (!onward || chain.includes(onward)) break;
      chain.push(onward);
    }
    for (let i = 1; i < chain.length; i++) walked.add(key(chain[i - 1], chain[i]));
    return chain;
  };

  /** Each stretch between nodes, with its stops. */
  const runs: string[][] = [];
  const addChain = (chain: string[]) => {
    const last = chain[chain.length - 1];
    // A loop with no junction on it (the City Circle on its own) is anchored where it starts.
    if (!(last in node)) node[last] = [...at[last]];
    const kept = simplify(chain.map((id) => at[id]), TURN);
    for (const i of kept) node[chain[i]] ??= [...at[chain[i]]];
    for (let k = 1; k < kept.length; k++) runs.push(chain.slice(kept[k - 1], kept[k] + 1));
  };
  for (const id of Object.keys(node))
    for (const n of next.get(id)!) if (!walked.has(key(id, n))) addChain(walk(id, n));
  for (const id of next.keys()) {
    if (id in node) continue;
    node[id] = [...at[id]];
    for (const n of next.get(id)!) if (!walked.has(key(id, n))) addChain(walk(id, n));
  }

  // Nudge the nodes until the runs between them lie at 45° or 90° as far as they can, each held loosely
  // to where it was so the diagram keeps its shape.
  const home = Object.fromEntries(Object.entries(node).map(([id, p]) => [id, [...p] as Pt]));
  for (let round = 0; round < 400; round++) {
    for (const run of runs) {
      const [a, b] = [node[run[0]], node[run[run.length - 1]]];
      const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
      const len = Math.hypot(dx, dy);
      if (len < 1) continue;
      const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
      const [cx, cy] = [(Math.cos(angle) * len - dx) / 4, (Math.sin(angle) * len - dy) / 4];
      a[0] -= cx;
      a[1] -= cy;
      b[0] += cx;
      b[1] += cy;
    }
    for (const [id, p] of Object.entries(node)) {
      p[0] += (home[id][0] - p[0]) * 0.02;
      p[1] += (home[id][1] - p[1]) * 0.02;
    }
  }

  const out: Record<string, Pt> = {};
  const bends: Record<string, Pt[]> = {};
  for (const [id, p] of Object.entries(node)) out[id] = snap(p);
  for (const run of runs) {
    const real = run.map((id) => at[id]);
    const [a, b] = [out[run[0]], out[run[run.length - 1]]];
    const path = legs(a, b, real[Math.round((real.length - 1) / 2)]);
    // Stops are spaced along the legs as they are along the street.
    const gone = [0];
    for (let i = 1; i < real.length; i++) gone.push(gone[i - 1] + dist(real[i - 1], real[i]));
    const total = gone[gone.length - 1];
    let prevLeg = 0;
    for (let s = 1; s < run.length; s++) {
      const last = s === run.length - 1;
      const { p, leg } = last ? { p: b, leg: path.length - 2 } : along(path, total ? gone[s] / total : s / (run.length - 1));
      if (!last) out[run[s]] = round(p);
      if (leg > prevLeg) bends[`${run[s - 1]}>${run[s]}`] = path.slice(prevLeg + 1, leg + 1).map(round);
      prevLeg = leg;
    }
  }
  return { at: out, bends };
}
