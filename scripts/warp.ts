/** Bending real positions to fit the schematic, for stops the train map doesn't lay out by hand. */
import stations from "../data/stations.json";
import { STATIONS } from "../shared/network";

type Pt = [number, number];

const flinders = stations.stations["flinders-street"];
/** Kilometres east and south of Flinders Street. */
const km = (lat: number, lon: number): Pt => [
  (lon - flinders.lon) * 111.32 * Math.cos((flinders.lat * Math.PI) / 180),
  -(lat - flinders.lat) * 110.57,
];

/**
 * A smooth map from real positions to the schematic's, fitted to the train stations within `radius` km of the
 * city; `smoothing` trades passing exactly through each station for fewer kinks between them.
 */
export function schematicWarp(radius = 20, smoothing = Number(process.env.SMOOTHING ?? 3)) {
  const control = Object.values(STATIONS).flatMap((s) => {
    const real = (stations.stations as Record<string, { lat: number; lon: number }>)[s.id];
    if (!real) return [];
    const p = km(real.lat, real.lon);
    return Math.hypot(...p) <= radius ? [{ p, v: [s.x, s.y] as Pt }] : [];
  });
  const n = control.length;
  const size = n + 3;
  const U = (r: number) => (r < 1e-9 ? 0 : r * r * Math.log(r));
  const solve = (axis: 0 | 1) => {
    const A = Array.from({ length: size }, () => new Float64Array(size + 1));
    control.forEach(({ p, v }, i) => {
      control.forEach((o, j) => (A[i][j] = U(Math.hypot(p[0] - o.p[0], p[1] - o.p[1])) + (i === j ? smoothing : 0)));
      [A[i][n], A[i][n + 1], A[i][n + 2]] = [1, p[0], p[1]];
      [A[n][i], A[n + 1][i], A[n + 2][i]] = [1, p[0], p[1]];
      A[i][size] = v[axis];
    });
    // Gauss-Jordan elimination with partial pivoting.
    for (let c = 0; c < size; c++) {
      let pivot = c;
      for (let r = c + 1; r < size; r++) if (Math.abs(A[r][c]) > Math.abs(A[pivot][c])) pivot = r;
      [A[c], A[pivot]] = [A[pivot], A[c]];
      for (let r = 0; r < size; r++) {
        if (r === c) continue;
        const f = A[r][c] / A[c][c];
        if (f) for (let k = c; k <= size; k++) A[r][k] -= f * A[c][k];
      }
    }
    return A.map((row, i) => row[size] / row[i]);
  };
  const weights = [solve(0), solve(1)];
  return (lat: number, lon: number): Pt => {
    const p = km(lat, lon);
    return weights.map((w) => {
      let s = w[n] + w[n + 1] * p[0] + w[n + 2] * p[1];
      control.forEach(({ p: c }, i) => (s += w[i] * U(Math.hypot(p[0] - c[0], p[1] - c[1]))));
      return Math.round(s * 10) / 10;
    }) as Pt;
  };
}

