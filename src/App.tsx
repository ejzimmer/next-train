import { useCallback, useEffect, useMemo, useState } from "react";
import stationData from "../data/stations.json";
import { LINES } from "../shared/network";
import type { AlertDto, LineConfig, NetworkAlertsResponse, StationDeparturesResponse, VehiclesResponse } from "../shared/types";
import { Disruptions } from "./Disruptions";
import { LineMap } from "./LineMap";
import { LineSwitches } from "./LineSwitches";
import { Loading } from "./Loading";
import { StationBoard } from "./StationBoard";
import { useNearestStation } from "./useNearestStation";
import { useNow, usePoll } from "./usePoll";

/** About three times a minute; the API allows 24 calls a minute per feed. */
const POLL_MS = 20_000;
const ALERTS_POLL_MS = 2 * 60_000;

function stationFromUrl() {
  return new URLSearchParams(location.search).get("station");
}

/** Where each station is, for finding the nearest one. */
const PLACES = stationData.stations as Record<string, { lat: number; lon: number }>;
const NEAREST_KEY = "showNearest";
const LINES_KEY = "lines";

function savedLines(): string[] {
  try {
    const ids = JSON.parse(localStorage.getItem(LINES_KEY) ?? "null");
    if (Array.isArray(ids)) return ids.filter((id) => LINES.some((l) => l.id === id));
  } catch {
    // Fall through to the default.
  }
  return ["hurstbridge"];
}

function savedShowNearest() {
  try {
    return localStorage.getItem(NEAREST_KEY) === "1";
  } catch {
    return false;
  }
}

function showStation(id: string | null) {
  const url = new URL(location.href);
  if (id) url.searchParams.set("station", id);
  else url.searchParams.delete("station");
  history.replaceState(null, "", url);
}

export function App() {
  const [selected, setSelected] = useState<string | null>(stationFromUrl);
  const [lineIds, setLineIds] = useState(savedLines);
  const lines = useMemo(() => LINES.filter((l) => lineIds.includes(l.id)), [lineIds]);
  const toggleLine = (id: string) => {
    const next = lineIds.includes(id) ? lineIds.filter((x) => x !== id) : [...lineIds, id];
    setLineIds(next);
    try {
      localStorage.setItem(LINES_KEY, JSON.stringify(next));
    } catch {
      // Not remembered; fine.
    }
  };
  const onMap = useMemo(() => new Set(lines.flatMap((l) => l.stations.map((s) => s.id))), [lines]);
  const station = selected && onMap.has(selected) ? selected : null;

  const vehicles = usePoll<VehiclesResponse>("/api/vehicles", POLL_MS);
  const departures = usePoll<StationDeparturesResponse>(station && `/api/departures?station=${station}`, POLL_MS);
  const alerts = usePoll<NetworkAlertsResponse>("/api/alerts", ALERTS_POLL_MS);
  const now = useNow(10_000);
  const hasStations = Object.keys(stationData.stations).length > 0;
  const shownVehicles = useMemo(
    () => (vehicles.data?.vehicles ?? []).filter((v) => lineIds.includes(v.line)),
    [vehicles.data, lineIds],
  );
  const shownDepartures = departures.data?.departures.filter((d) => lineIds.includes(d.line));
  // The same works are posted against each line they affect: show them once.
  // The same works are posted against each line they affect: show them once, with every line shown that they're on.
  const shownAlerts = useMemo(() => {
    const seen = new Map<string, { alert: AlertDto; lines: LineConfig[] }>();
    for (const l of lines)
      for (const a of alerts.data?.lines[l.id] ?? []) {
        const key = `${a.header}\n${a.description}`;
        const entry = seen.get(key) ?? { alert: a, lines: [] };
        entry.lines.push(l);
        seen.set(key, entry);
      }
    return [...seen.values()].sort((x, y) => (x.alert.start ?? 0) - (y.alert.start ?? 0));
  }, [alerts.data, lines]);
  const closedStretches = lines.flatMap((l) =>
    (alerts.data?.lines[l.id] ?? [])
      .filter((a) => a.stretch && (!a.start || a.start <= now))
      .map((a) => ({ line: l.id, ...a.stretch! })),
  );
  const places = useMemo(() => Object.fromEntries([...onMap].map((id) => [id, PLACES[id]])), [onMap]);

  const select = useCallback((id: string | null) => {
    setSelected((current) => {
      const next = current === id ? null : id;
      showStation(next);
      return next;
    });
  }, []);

  const [showNearest, setShowNearest] = useState(savedShowNearest);
  const nearest = useNearestStation(showNearest, places);
  const nearestId = nearest.status === "found" ? nearest.id : null;
  const toggleNearest = (on: boolean) => {
    setShowNearest(on);
    try {
      localStorage.setItem(NEAREST_KEY, on ? "1" : "0");
    } catch {
      // Not remembered; fine.
    }
  };
  // Open the nearest station's board when it's first found, and again whenever it changes.
  useEffect(() => {
    if (!nearestId) return;
    setSelected(nearestId);
    showStation(nearestId);
  }, [nearestId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && select(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [select]);

  // Only said when the live data is a minute or more old.
  const stale = useMemo(() => {
    const ts = vehicles.data?.feedTimestamp;
    if (!ts) return null;
    const secs = Math.round(now - ts);
    return secs < 60 ? null : `Updated ${Math.round(secs / 60)} min ago`;
  }, [vehicles.data, now]);

  return (
    <div className="app">
      <header className="top">
        <div className="title-row">
          <h1>{lines.length === 1 ? `${lines[0].name} line` : "Metro trains"}</h1>
          <button
            className="icon-button locate"
            aria-pressed={showNearest}
            onClick={() => toggleNearest(!showNearest)}
            aria-label="Show nearest station"
            title="Show nearest station"
          >
            {/* A crosshair. */}
            <svg viewBox="0 0 24 24" aria-hidden>
              <circle cx={12} cy={12} r={7} fill="none" stroke="currentColor" strokeWidth={2} />
              <circle cx={12} cy={12} r={2.5} fill="currentColor" />
              <path d="M12 1v4M12 19v4M1 12h4M19 12h4" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <p className="muted">
          {vehicles.error ? "Live data unavailable, retrying" : stale}
        </p>
        <p className="muted" aria-live="polite">
          {nearestText(nearest)}
        </p>
        <LineSwitches on={lineIds} onToggle={toggleLine} />
      </header>
      <Disruptions alerts={shownAlerts} now={now} />
      {!hasStations && <p className="warning">Station data hasn't been generated yet (npm run gtfs).</p>}
      <main>
        {!vehicles.data && !vehicles.error ? (
          <Loading />
        ) : (
          <LineMap
            lines={lines}
            vehicles={shownVehicles}
            departures={shownDepartures}
            closedStretches={closedStretches}
            now={now}
            selected={station}
            nearest={nearestId}
            onSelect={select}
            board={
              station && (
                <StationBoard
                  stationId={station}
                  colour={lines.find((l) => l.stations.some((s) => s.id === station))!.colour}
                  departures={shownDepartures}
                  vehicles={shownVehicles}
                  now={now}
                  onClose={() => select(null)}
                />
              )
            }
          />
        )}
      </main>
      <footer className="muted">
        Source: Licensed from Public Transport Victoria under a Creative Commons Attribution 4.0 International Licence.
        Not affiliated with PTV.
      </footer>
    </div>
  );
}

/** Only says something when the location can't be used. */
function nearestText(nearest: ReturnType<typeof useNearestStation>) {
  switch (nearest.status) {
    case "off":
    case "locating":
    case "found":
      return null;
    case "denied":
      return "Location is blocked for this site in your browser settings";
    case "unavailable":
      return "Couldn't get your location";
  }
}
