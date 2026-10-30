import { Train, trainWidth } from "./Loading";

/** Track to the left of the train, and room for the buffer stop on the right. */
const [LEAD, END] = [120, 60];
/** Ground level of each siding, back to front; the train is on the front one. */
const SIDINGS = [44, 116];
/** The feed doesn't say which train ran a finished trip, so it's drawn as the usual six cars. */
const CARS = 6;

/** Shown when a shared train link is opened after the train's trip has ended: the train parked in a yard. */
export function TripFinished() {
  const width = LEAD + trainWidth(CARS) + END;
  const height = SIDINGS[SIDINGS.length - 1] + 10;
  return (
    <div className="loading yard" role="alert">
      <svg viewBox={`0 0 ${width} ${height}`} width={width} className="yard-scene" aria-hidden>
        {/* A floodlight tower behind the sidings. */}
        <line x1={50} x2={50} y1={8} y2={SIDINGS[0]} className="yard-pole" />
        <rect x={36} y={2} width={28} height={10} rx={2} className="yard-lamp" />
        {SIDINGS.map((y, i) => (
          <g key={y}>
            {Array.from({ length: Math.floor((width - END + 10) / 20) }, (_, k) => (
              <rect key={k} x={4 + k * 20} y={y + 1} width={12} height={6} className="yard-sleeper" />
            ))}
            <line x1={0} x2={width - END + 30} y1={y} y2={y} className="yard-rail" />
            {/* Buffer stop at the end of the siding. */}
            <path d={`M${width - END + 14},${y} L${width - END + 24},${y - 30} L${width - END + 34},${y}`} className="yard-buffer" />
            <rect x={width - END + 8} y={y - 34} width={14} height={14} rx={2} className="yard-buffer-beam" />
            {i === SIDINGS.length - 1 && (
              <g transform={`translate(${LEAD} ${y - 57})`}>
                <Train cars={CARS} />
              </g>
            )}
          </g>
        ))}
      </svg>
      <p className="yard-text">Trip finished</p>
    </div>
  );
}
