import { Set as XTrapolis } from "./Loading";

const WIDTH = 760;
/** Ground level of each siding, back to front. */
const SIDINGS = [70, 110, 150];
const PARKED = 1;

/** Shown when a shared train link is opened after the train's trip has ended: the train parked in a yard. */
export function TripFinished() {
  return (
    <div className="loading yard" role="alert">
      <svg viewBox={`0 0 ${WIDTH} 180`} className="yard-scene" aria-hidden>
        {/* A floodlight tower behind the sidings. */}
        <line x1={110} x2={110} y1={10} y2={70} className="yard-pole" />
        <rect x={96} y={4} width={28} height={10} rx={2} className="yard-lamp" />
        {SIDINGS.map((y, i) => (
          <g key={y}>
            <line x1={0} x2={WIDTH - 40} y1={y} y2={y} className="yard-rail" />
            {Array.from({ length: Math.floor((WIDTH - 40) / 24) }, (_, k) => (
              <rect key={k} x={6 + k * 24} y={y} width={12} height={4} className="yard-sleeper" />
            ))}
            {/* Buffer stop at the end of the siding. */}
            <path d={`M${WIDTH - 48},${y} V${y - 20} H${WIDTH - 36} V${y}`} className="yard-buffer" />
            <rect x={WIDTH - 54} y={y - 22} width={8} height={10} className="yard-buffer-beam" />
            {i === PARKED && (
              <g transform={`translate(${WIDTH - 56 - (3 * 104 + 6)} ${y - 56})`}>
                <XTrapolis x={0} />
              </g>
            )}
          </g>
        ))}
      </svg>
      <p className="yard-text">Trip finished</p>
    </div>
  );
}
