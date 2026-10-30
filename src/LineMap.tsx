import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { LINES, STATIONS } from "../shared/network";
import type { DepartureDto, LineConfig, SchematicStation, VehicleDto } from "../shared/types";
import { networkGeometry, pathOf, pointAlong, type Pt } from "./schematic";
import { useStopped } from "./useStopped";

const STALE_AFTER = 3 * 60;
const HIDE_AFTER = 10 * 60;
const BOARD_WIDTH = 380;
/** A guess at a board's height until it's been drawn and can be measured. */
const BOARD_HEIGHT = 300;
/** Room below the drawing for the legend. */
const LEGEND_ROOM = 60;
/** Size of the cells the board's spot is searched in. */
const CELL = 16;
/** Space around the drawing, so labels and trains at the edges aren't cut off. */
const MARGIN = 24;
const [MIN_ZOOM, MAX_ZOOM] = [0.2, 3];
/** Trains on this line keep the usual colours; trains on other lines are white, as shared-track trains were before. */
const HOME_LINE = "hurstbridge";

interface Props {
  /** The lines switched on. */
  lines: LineConfig[];
  vehicles: VehicleDto[];
  /** Live departures from the selected station, used for a train's destination when the timetable data doesn't know its trip. */
  departures?: DepartureDto[];
  /** Stretches of a line with no trains right now (buses replacing trains, City Loop closed), drawn dashed. */
  closedStretches: { line: string; from: string; to: string }[];
  now: number;
  selected: string | null;
  /** The station nearest the device, when the viewer has asked for it. */
  nearest: string | null;
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
/** Rough width of a character in a station name, for fitting the drawing around its labels. */
const CHAR = 7.5;

interface MapStation {
  id: string;
  name: string;
  label: SchematicStation["label"];
  nudge?: [number, number];
  /** Where the station sits on each line through it. */
  points: Pt[];
  colours: Set<string>;
  /** The two ends of the marker; the same point when every line through it is drawn in one place. */
  ends: [Pt, Pt];
  labelAt: Pt;
}

function farthestPair(points: Pt[]): [Pt, Pt] {
  let best: [Pt, Pt] = [points[0], points[0]];
  let max = -1;
  for (const p of points)
    for (const q of points) {
      const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (d > max) [max, best] = [d, [p, q]];
    }
  return best;
}

export function LineMap({
  lines,
  vehicles,
  departures,
  closedStretches,
  now,
  selected,
  nearest,
  onSelect,
  board,
}: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const stopped = useStopped(vehicles);
  const geometry = useMemo(() => networkGeometry(lines, LINES), [lines]);

  const stations = useMemo(() => {
    const byId = new Map<string, MapStation>();
    for (const line of lines) {
      const geo = geometry.get(line.id)!;
      line.stations.forEach((s, i) => {
        const entry = byId.get(s.id) ?? {
          id: s.id,
          name: s.name,
          label: s.label,
          nudge: s.nudge,
          points: [],
          colours: new Set<string>(),
          ends: [geo.stations[i], geo.stations[i]] as [Pt, Pt],
          labelAt: geo.stations[i],
        };
        entry.points.push(geo.stations[i]);
        entry.colours.add(line.colour);
        byId.set(s.id, entry);
      });
    }
    for (const s of byId.values()) {
      s.ends = farthestPair(s.points);
      const xs = s.points.map((p) => p[0]);
      const ys = s.points.map((p) => p[1]);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      const l = LABEL[s.label];
      const edge: Pt =
        s.label === "t"
          ? [cx, Math.min(...ys)]
          : s.label === "b"
            ? [cx, Math.max(...ys)]
            : s.label === "l"
              ? [Math.min(...xs), cy]
              : [Math.max(...xs), cy];
      s.labelAt = [edge[0] + l.dx + (s.nudge?.[0] ?? 0), edge[1] + l.dy + (s.nudge?.[1] ?? 0)];
    }
    return [...byId.values()];
  }, [lines, geometry]);

  // The drawing is cropped to the lines switched on, labels included.
  const box = useMemo(() => {
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    const add = (x: number, y: number) => {
      [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
    };
    for (const s of stations) {
      s.points.forEach(([x, y]) => add(x, y));
      const w = s.name.length * CHAR;
      const [x, y] = s.labelAt;
      const anchor = LABEL[s.label].anchor;
      const left = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2;
      add(left, y - 13);
      add(left + w, y + 4);
    }
    if (!stations.length) return { x: 0, y: 0, width: 0, height: 0 };
    return { x: x0 - MARGIN, y: y0 - MARGIN, width: x1 - x0 + 2 * MARGIN, height: y1 - y0 + 2 * MARGIN };
  }, [stations]);

  // Ctrl/⌘ + wheel (or a trackpad pinch), a two-finger pinch and the + and - keys zoom.
  const [scale, setZoom] = useState(1);
  const [width, height] = [box.width * scale, box.height * scale];
  // The latest scale, for the event handlers below.
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  /** Zooms by `factor`, keeping the point at (clientX, clientY) where it is on screen. */
  const zoomBy = useRef((factor: number, clientX: number, clientY: number) => {
    const el = scroller.current;
    if (!el) return;
    const from = scaleRef.current;
    const to = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, from * factor));
    if (to === from) return;
    const map = el.firstElementChild!.getBoundingClientRect();
    const [x, y] = [clientX - map.left, clientY - map.top];
    setZoom(to);
    requestAnimationFrame(() => {
      const moved = el.firstElementChild!.getBoundingClientRect();
      el.scrollLeft += moved.left + (x * to) / from - clientX;
      window.scrollBy(0, moved.top + (y * to) / from - clientY);
    });
  }).current;

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomBy(Math.exp(-e.deltaY / 300), e.clientX, e.clientY);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement).closest?.("input, textarea")) return;
      const factor = e.key === "+" || e.key === "=" ? 1.25 : e.key === "-" || e.key === "_" ? 0.8 : null;
      if (!factor) return;
      const r = el.getBoundingClientRect();
      zoomBy(factor, r.left + el.clientWidth / 2, Math.max(r.top, 0) + Math.min(r.height, window.innerHeight) / 2);
    };
    // A two-finger pinch on the map zooms the map rather than the page.
    let pinch: number | null = null;
    const spread = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2) {
        pinch = null;
        return;
      }
      e.preventDefault();
      const d = spread(e.touches);
      if (pinch)
        zoomBy(
          d / pinch,
          (e.touches[0].clientX + e.touches[1].clientX) / 2,
          (e.touches[0].clientY + e.touches[1].clientY) / 2,
        );
      pinch = d;
    };
    const onTouchEnd = () => (pinch = null);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    window.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("keydown", onKey);
    };
  }, [zoomBy]);

  // Points along the drawn lines and labels, which the board tries not to cover.
  const ink = useMemo(() => {
    const pts: Pt[] = [];
    for (const geo of geometry.values())
      for (const seg of geo.segments)
        for (let k = 1; k < seg.length; k++) {
          const [[x0, y0], [x1, y1]] = [seg[k - 1], seg[k]];
          const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 6);
          for (let t = 0; t <= steps; t++) pts.push([x0 + ((x1 - x0) * t) / steps, y0 + ((y1 - y0) * t) / steps]);
        }
    for (const s of stations) {
      const [x, y] = s.labelAt;
      const w = s.name.length * CHAR;
      const anchor = LABEL[s.label].anchor;
      const left = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2;
      for (let dx = 0; dx <= w; dx += 6) for (const dy of [-12, -4, 4]) pts.push([left + dx, y + dy]);
    }
    return pts;
  }, [geometry, stations]);

  const anchor = useRef<HTMLDivElement>(null);
  const [boardHeight, setBoardHeight] = useState(BOARD_HEIGHT);
  useLayoutEffect(() => {
    const el = anchor.current;
    if (!el) return;
    const measure = () => setBoardHeight(el.offsetHeight || BOARD_HEIGHT);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [selected]);

  // Room either side of the map when it's narrower than the window; the board can sit there too.
  const [side, setSide] = useState(0);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => {
      const pad = parseFloat(getComputedStyle(el).paddingLeft) || 0;
      setSide(Math.max(0, (el.clientWidth - 2 * pad - width) / 2));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [width]);

  const sel = stations.find((s) => s.id === selected);
  const selAt = sel && {
    x: ((sel.ends[0][0] + sel.ends[1][0]) / 2 - box.x) * scale,
    y: ((sel.ends[0][1] + sel.ends[1][1]) / 2 - box.y) * scale,
  };
  const boardPos = useMemo(
    () =>
      selAt &&
      boardPosition(selAt, {
        left: -side,
        right: width + side,
        height,
        boardHeight,
        ink: ink.map(([x, y]) => [(x - box.x) * scale, (y - box.y) * scale]),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selAt?.x, selAt?.y, side, width, height, boardHeight, ink, box, scale],
  );
  const placeName = (id: string) => STATIONS[id]?.name ?? id;
  // The timetable's terminus, else the one in the live departures (for trips added since the data was built).
  const destinationOf = (v: VehicleDto) =>
    v.destination ?? departures?.find((d) => d.tripId === v.tripId)?.destination ?? null;
  // A line ends with a bar across it, unless another line switched on carries on through.
  const throughStations = new Set(lines.flatMap((l) => l.stations.slice(1, -1).map((s) => s.id)));

  // On narrow screens the map scrolls sideways: bring the selected station into view.
  useEffect(() => {
    const el = scroller.current;
    if (!el || !sel || !selAt) return;
    const { left } = boardPos!;
    const from = Math.min(selAt.x, left) - 16;
    const to = Math.max(selAt.x, left + BOARD_WIDTH) + 16;
    if (from < el.scrollLeft || to > el.scrollLeft + el.clientWidth) el.scrollTo({ left: from, behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, box.width]);

  return (
    <div className="map-scroll" ref={scroller}>
      <div
        className="line-map"
        style={{ width, height: Math.max(height + LEGEND_ROOM, boardPos ? boardPos.top + boardHeight + 16 : 0) }}
      >
        <svg
          width={width}
          height={height}
          viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
          role="img"
          aria-label={`${lines.map((l) => l.name).join(", ")} line map`}
        >
          <defs>
            {/* Paints a box behind a station name, for hover and focus. */}
            <filter id="label-bg" x="-0.06" y="-0.12" width="1.12" height="1.24">
              <feFlood className="label-bg" />
              <feComposite in="SourceGraphic" operator="over" />
            </filter>
          </defs>
          {lines.map((line) => {
            const geo = geometry.get(line.id)!;
            const n = line.stations.length - 1;
            const main = geo.segments.slice(0, n).flat();
            return (
              <g key={line.id} stroke={line.colour} strokeWidth={8} fill="none" strokeLinejoin="round">
                {geo.segments.slice(n).map((track, i) => (
                  <path key={i} d={pathOf(track)} strokeLinecap="round" />
                ))}
                <path d={pathOf(main)} strokeLinecap="round" />
                {!throughStations.has(line.stations[n].id) && <EndBar points={geo.segments[n - 1]} />}
              </g>
            );
          })}
          {closedStretches.map(({ line: id, from, to }) => {
            const line = lines.find((l) => l.id === id);
            const geo = geometry.get(id);
            if (!line || !geo) return null;
            const a = line.stations.findIndex((s) => s.id === from);
            const b = line.stations.findIndex((s) => s.id === to);
            if (a < 0 || b <= a) return null;
            return (
              <path key={`${id}-${from}-${to}`} className="bus-stretch" d={pathOf(geo.segments.slice(a, b).flat())} />
            );
          })}
          {stations.map((s) => {
            const interchange = s.colours.size > 1;
            const [p, q] = s.ends;
            const [cx, cy] = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
            const half = Math.hypot(p[0] - q[0], p[1] - q[1]) / 2;
            const colour = interchange ? "var(--fg)" : [...s.colours][0];
            return (
              <g
                key={s.id}
                className={`station${interchange ? " interchange" : ""}${selected === s.id ? " selected" : ""}${nearest === s.id ? " nearest" : ""}`}
                onClick={() => onSelect(s.id)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(s.id)}
                role="button"
                tabIndex={0}
                aria-label={nearest === s.id ? `${s.name}, nearest to you` : s.name}
                aria-pressed={selected === s.id}
                style={{ ["--line" as string]: colour }}
              >
                <line
                  className="station-hit"
                  x1={p[0]}
                  y1={p[1]}
                  x2={q[0]}
                  y2={q[1]}
                  strokeWidth={28}
                  strokeLinecap="round"
                />
                {nearest === s.id && <circle className="station-here" cx={cx} cy={cy} r={12 + half} />}
                {/* A dot in the line's colour, or a white capsule outlined in black across every line at an interchange. */}
                <line
                  className="station-rim"
                  x1={p[0]}
                  y1={p[1]}
                  x2={q[0]}
                  y2={q[1]}
                  stroke={colour}
                  strokeWidth={15}
                  strokeLinecap="round"
                />
                <line
                  className="station-dot"
                  x1={p[0]}
                  y1={p[1]}
                  x2={q[0]}
                  y2={q[1]}
                  strokeWidth={9}
                  strokeLinecap="round"
                />
                <text x={s.labelAt[0]} y={s.labelAt[1]} textAnchor={LABEL[s.label].anchor}>
                  {s.name}
                </text>
              </g>
            );
          })}
          {vehicles.map((v) => {
            const geo = geometry.get(v.line);
            const age = now - v.timestamp;
            const pts = geo?.segments[v.segment];
            if (!pts || age > HIDE_AFTER) return null;
            const p = pointAlong(pts, v.fraction);
            const angle = p.angle + (v.direction === "citybound" ? 180 : 0);
            const dest = destinationOf(v);
            return (
              <g
                key={v.id}
                className={`train${v.line === HOME_LINE ? "" : " shared"}${age > STALE_AFTER ? " stale" : stopped.has(v.id) ? " stopped" : ""}`}
                style={{ transform: `translate(${p.x}px, ${p.y}px) rotate(${angle}deg)` }}
              >
                {/* Arrow pointing the way the train is heading; a plain dot when unknown. */}
                {v.direction ? <path d={ARROW} /> : <circle r={6} />}
                <title>
                  {[
                    dest ? `to ${placeName(dest)}` : v.direction === "citybound" && "to the city",
                    stopped.has(v.id) && "stopped",
                  ]
                    .filter(Boolean)
                    .join(", ")
                    .replace(/^./, (c) => c.toUpperCase())}
                </title>
              </g>
            );
          })}
        </svg>
        {lines.length > 0 && (
          <Legend
            home={lines.some((l) => l.id === HOME_LINE)}
            others={lines.some((l) => l.id !== HOME_LINE)}
            closed={closedStretches.length > 0}
            colour={lines[0].colour}
          />
        )}
        {boardPos && (
          <div className="board-anchor" ref={anchor} style={{ ...boardPos, width: BOARD_WIDTH }}>
            {board}
          </div>
        )}
      </div>
    </div>
  );
}

/** A bar across the end of the line. */
function EndBar({ points }: { points: Pt[] }) {
  const [x0, y0] = points[points.length - 2];
  const [x1, y1] = points[points.length - 1];
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  const [nx, ny] = [(-(y1 - y0) / len) * 10, ((x1 - x0) / len) * 10];
  return <line x1={x1 - nx} y1={y1 - ny} x2={x1 + nx} y2={y1 + ny} strokeWidth={6} />;
}

/**
 * Where the board goes: the spot nearest the station that covers the least of the lines, names and
 * legend, anywhere between `left` and `right` (which may be outside the map) and below the top of the
 * map. It never covers the station itself.
 */
function boardPosition(
  at: { x: number; y: number },
  room: { left: number; right: number; height: number; boardHeight: number; ink: Pt[] },
) {
  const h = room.boardHeight;
  const cols = Math.max(1, Math.ceil((room.right - room.left) / CELL));
  const rows = Math.ceil((room.height + LEGEND_ROOM + h) / CELL) + 1;
  // How much is drawn in each cell, then summed so any rectangle of cells can be totalled at once.
  const sum = new Float64Array((cols + 1) * (rows + 1));
  const add = (x: number, y: number, n = 1) => {
    const c = Math.floor((x - room.left) / CELL);
    const r = Math.floor(y / CELL);
    if (c >= 0 && c < cols && r >= 0 && r < rows) sum[(r + 1) * (cols + 1) + c + 1] += n;
  };
  for (const [x, y] of room.ink) add(x, y);
  // The legend, below the map.
  for (let x = 0; x < room.right + room.left; x += CELL)
    for (let y = room.height; y < room.height + LEGEND_ROOM; y += CELL) add(x, y, 4);
  for (let r = 1; r <= rows; r++)
    for (let c = 1; c <= cols; c++)
      sum[r * (cols + 1) + c] += sum[(r - 1) * (cols + 1) + c] + sum[r * (cols + 1) + c - 1] - sum[(r - 1) * (cols + 1) + c - 1];
  const total = (c0: number, r0: number, c1: number, r1: number) =>
    sum[r1 * (cols + 1) + c1] - sum[r0 * (cols + 1) + c1] - sum[r1 * (cols + 1) + c0] + sum[r0 * (cols + 1) + c0];

  const [wide, tall] = [Math.ceil(BOARD_WIDTH / CELL), Math.ceil(h / CELL)];
  let best = { left: Math.max(room.left, Math.min(room.right - BOARD_WIDTH, at.x - 60)), top: at.y + 20 };
  let cost = Infinity;
  for (let r = 0; r + tall <= rows; r++)
    for (let c = 0; c + wide <= Math.max(wide, cols); c++) {
      const left = room.left + c * CELL;
      const top = r * CELL;
      const dx = Math.max(left - at.x, 0, at.x - (left + BOARD_WIDTH));
      const dy = Math.max(top - at.y, 0, at.y - (top + h));
      if (dx < 16 && dy < 16) continue;
      const covered = total(c, r, Math.min(cols, c + wide), r + tall);
      const here = covered * 1000 + Math.hypot(dx, dy);
      if (here < cost) [best, cost] = [{ left, top }, here];
    }
  return best;
}

const ARROW = "M14,0 L-10,-11 L-5,0 L-10,11 Z";

function Legend({ home, others, closed, colour }: { home: boolean; others: boolean; closed: boolean; colour: string }) {
  const homeName = LINES.find((l) => l.id === HOME_LINE)!.name;
  const items: [string, string][] = [
    ...(home && others
      ? ([
          ["train", `${homeName} train`],
          ["train shared", "Other trains"],
        ] as [string, string][])
      : [[home ? "train" : "train shared", "Train"] as [string, string]]),
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
      {closed && (
        <li>
          <svg width={28} height={24} viewBox="0 -12 28 24" aria-hidden>
            <line x1={0} x2={28} y1={0} y2={0} stroke={colour} strokeWidth={8} />
            <line className="bus-stretch" x1={0} x2={28} y1={0} y2={0} />
          </svg>
          No trains
        </li>
      )}
    </ul>
  );
}
