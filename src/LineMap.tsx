import { useEffect, useRef, type ReactNode } from "react";
import type { LineConfig, SchematicStation, VehicleDto } from "../shared/types";
import { linePath, pointOnLine } from "./schematic";
import { useStopped } from "./useStopped";

const STALE_AFTER = 3 * 60;
const HIDE_AFTER = 10 * 60;
const BOARD_WIDTH = 380;
/** Room below the drawing for a board opened on a low station. */
const BOARD_ROOM = 220;

interface Props {
  line: LineConfig;
  vehicles: VehicleDto[];
  now: number;
  selected: string | null;
  onSelect: (stationId: string) => void;
  /** Shown beside the selected station's name. */
  board: ReactNode;
}

const LABEL: Record<SchematicStation["label"], { dx: number; dy: number; anchor: "start" | "middle" | "end" }> = {
  t: { dx: 0, dy: -14, anchor: "middle" },
  b: { dx: 0, dy: 24, anchor: "middle" },
  l: { dx: -14, dy: 5, anchor: "end" },
  r: { dx: 14, dy: 5, anchor: "start" },
};

export function LineMap({ line, vehicles, now, selected, onSelect, board }: Props) {
  const { width, height } = line.schematic;
  const stations = line.stations;
  const last = stations[stations.length - 1];
  const sel = stations.find((s) => s.id === selected);
  const scroller = useRef<HTMLDivElement>(null);
  const stopped = useStopped(vehicles);
  const boardPos = sel && boardPosition(sel, width);

  // On narrow screens the map scrolls sideways: bring the selected station into view.
  useEffect(() => {
    const el = scroller.current;
    if (!el || !sel) return;
    const { left } = boardPosition(sel, width);
    const from = Math.min(sel.x, left) - 16;
    const to = Math.max(sel.x, left + BOARD_WIDTH) + 16;
    if (from < el.scrollLeft || to > el.scrollLeft + el.clientWidth) el.scrollTo({ left: from, behavior: "smooth" });
  }, [sel, width]);

  return (
    <div className="map-scroll" ref={scroller}>
      <div className="line-map" style={{ width, height: height + BOARD_ROOM }}>
        <svg width={width} height={height} role="img" aria-label={`${line.name} line map`}>
          {line.schematic.loopClosure && (
            <polyline points={line.schematic.loopClosure.join(" ")} fill="none" stroke={line.colour} strokeWidth={8} strokeLinejoin="round" />
          )}
          <path d={linePath(stations)} fill="none" stroke={line.colour} strokeWidth={8} strokeLinejoin="round" strokeLinecap="round" />
          <line x1={last.x} x2={last.x} y1={last.y - 10} y2={last.y + 10} stroke={line.colour} strokeWidth={6} />
          {stations.map((s) => {
            const l = LABEL[s.label];
            return (
              <g
                key={s.id}
                className={`station${selected === s.id ? " selected" : ""}`}
                onClick={() => onSelect(s.id)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(s.id)}
                role="button"
                tabIndex={0}
                aria-label={s.name}
              >
                <circle cx={s.x} cy={s.y} r={14} fill="transparent" />
                <circle cx={s.x} cy={s.y} r={6} fill="var(--bg)" stroke={line.colour} strokeWidth={3} />
                <text x={s.x + l.dx} y={s.y + l.dy} textAnchor={l.anchor}>
                  {s.name}
                </text>
              </g>
            );
          })}
          {vehicles.map((v) => {
            const age = now - v.timestamp;
            if (age > HIDE_AFTER || v.segment >= stations.length - 1) return null;
            const p = pointOnLine(stations, v.segment, v.fraction);
            const angle = p.angle + (v.direction === "citybound" ? 180 : 0);
            return (
              <g
                key={v.id}
                className={`train${v.route ? " shared" : ""}${age > STALE_AFTER ? " stale" : stopped.has(v.id) ? " stopped" : ""}`}
                style={{ transform: `translate(${p.x}px, ${p.y}px) rotate(${angle}deg)` }}
              >
                {/* Arrow pointing the way the train is heading; a plain dot when unknown. */}
                {v.direction ? <path d={ARROW} /> : <circle r={6} />}
                <title>
                  {[
                    `${v.route ?? line.name} train` +
                      (v.direction === "outbound" ? ` to ${v.route ?? line.name}` : v.direction ? " to the city" : ""),
                    v.trainType && `${v.cars} car ${v.trainType}`,
                    stopped.has(v.id) && "stopped",
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </title>
              </g>
            );
          })}
        </svg>
        <Legend line={line} />
        {boardPos && (
          <div className="board-anchor" style={{ ...boardPos, width: BOARD_WIDTH }}>
            {board}
          </div>
        )}
      </div>
    </div>
  );
}

/** Beside the label when it reads to the right and there's room; otherwise just below the station. */
function boardPosition(s: SchematicStation, width: number) {
  const besideLabel = s.x + 24 + s.name.length * 7.5;
  if (s.label === "r" && besideLabel + BOARD_WIDTH <= width) return { left: besideLabel, top: s.y - 22 };
  const below = s.label === "t" || s.label === "b" ? 40 : 20;
  return { left: Math.max(0, Math.min(width - BOARD_WIDTH, s.x - 60)), top: s.y + below };
}

const ARROW = "M14,0 L-10,-11 L-5,0 L-10,11 Z";

function Legend({ line }: { line: LineConfig }) {
  const items: [string, string][] = [
    ["train", `${line.name} train`],
    ...(line.shared ?? []).map((s): [string, string] => ["train shared", `${s.name} train`]),
    ["train stopped", "Stopped"],
    ["train stale", "No recent update"],
  ];
  return (
    <ul className="legend muted">
      {items.map(([cls, label]) => (
        <li key={label}>
          <svg width={28} height={24} viewBox="-14 -12 28 24" aria-hidden>
            <path className={cls} d={ARROW} />
          </svg>
          {label}
        </li>
      ))}
    </ul>
  );
}
