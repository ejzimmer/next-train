import type { LineConfig, VehicleDto } from "../shared/types";

export const ROW = 34;
const TOP = 24;
const LINE_X = 48;
const DOT_OFFSET = 11;
const STALE_AFTER = 3 * 60;
const HIDE_AFTER = 10 * 60;

interface Props {
  line: LineConfig;
  vehicles: VehicleDto[];
  now: number;
  selected: string | null;
  onSelect: (stationId: string) => void;
}

export function LineMap({ line, vehicles, now, selected, onSelect }: Props) {
  const height = TOP * 2 + ROW * (line.stations.length - 1);
  return (
    <svg className="line-map" viewBox={`0 0 320 ${height}`} role="img" aria-label={`${line.name} line map`}>
      <line x1={LINE_X} x2={LINE_X} y1={TOP} y2={height - TOP} stroke={line.colour} strokeWidth={8} strokeLinecap="round" />
      {line.stations.map((s, i) => (
        <g
          key={s.id}
          className={`station${selected === s.id ? " selected" : ""}`}
          transform={`translate(0 ${TOP + i * ROW})`}
          onClick={() => onSelect(s.id)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(s.id)}
        >
          <rect x={0} y={-ROW / 2} width={320} height={ROW} fill="transparent" />
          <circle cx={LINE_X} cy={0} r={7} fill="var(--bg)" stroke={line.colour} strokeWidth={3} />
          <text x={LINE_X + 32} y={5}>
            {s.name}
          </text>
        </g>
      ))}
      {vehicles.map((v) => {
        const age = now - v.timestamp;
        if (age > HIDE_AFTER) return null;
        const x = LINE_X + (v.direction === "outbound" ? DOT_OFFSET : v.direction === "citybound" ? -DOT_OFFSET : 0);
        const y = TOP + (v.segment + v.fraction) * ROW;
        return (
          <circle
            key={v.id}
            className={`train${age > STALE_AFTER ? " stale" : ""}`}
            r={6}
            style={{ transform: `translate(${x}px, ${y}px)` }}
          >
            <title>{v.direction === "outbound" ? "To Hurstbridge" : v.direction === "citybound" ? "To the city" : "Train"}</title>
          </circle>
        );
      })}
    </svg>
  );
}
