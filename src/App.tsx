import { useCallback, useEffect, useMemo, useState } from "react";
import hurstbridge from "../lines/hurstbridge.json";
import stationData from "../data/hurstbridge.stations.json";
import type { AlertsResponse, DeparturesResponse, LineConfig, VehiclesResponse } from "../shared/types";
import { Disruptions } from "./Disruptions";
import { LineMap } from "./LineMap";
import { Loading } from "./Loading";
import { StationBoard } from "./StationBoard";
import { useNearestStation } from "./useNearestStation";
import { useNow, usePoll } from "./usePoll";

const line = hurstbridge as LineConfig;
/** About three times a minute; the API allows 24 calls a minute per feed. */
const POLL_MS = 20_000;
const ALERTS_POLL_MS = 2 * 60_000;

function stationFromUrl() {
  return new URLSearchParams(location.search).get("station");
}

/** Where each station is, for finding the nearest one. */
const PLACES = stationData.stations as Record<string, { lat: number; lon: number }>;
const NEAREST_KEY = "showNearest";

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
  const vehicles = usePoll<VehiclesResponse>(`/api/vehicles?line=${line.id}`, POLL_MS);
  const departures = usePoll<DeparturesResponse>(`/api/departures?line=${line.id}`, POLL_MS);
  const alerts = usePoll<AlertsResponse>(`/api/alerts?line=${line.id}`, ALERTS_POLL_MS);
  const now = useNow(10_000);
  const hasStations = Object.keys(stationData.stations).length > 0;

  const select = useCallback((id: string | null) => {
    setSelected((current) => {
      const next = current === id ? null : id;
      showStation(next);
      return next;
    });
  }, []);

  const [showNearest, setShowNearest] = useState(savedShowNearest);
  const nearest = useNearestStation(showNearest, PLACES);
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

  const updated = useMemo(() => {
    const ts = vehicles.data?.feedTimestamp;
    if (!ts) return null;
    const secs = Math.max(0, Math.round(now - ts));
    return secs < 60 ? "just now" : `${Math.round(secs / 60)} min ago`;
  }, [vehicles.data, now]);

  return (
    <div className="app">
      <header className="top">
        <h1>{line.name} line</h1>
        <p className="muted">
          {vehicles.error ? "Live data unavailable, retrying" : updated ? `Updated ${updated}` : "Loading live data…"}
        </p>
        <div className="nearest-toggle">
          <label className="switch">
            <input type="checkbox" role="switch" checked={showNearest} onChange={(e) => toggleNearest(e.target.checked)} />
            <span className="switch-track" aria-hidden />
            Show nearest station
          </label>
          <span className="muted" aria-live="polite">
            {nearestText(nearest)}
          </span>
        </div>
      </header>
      <Disruptions line={line} alerts={alerts.data?.alerts} now={now} />
      {!hasStations && <p className="warning">Station data hasn't been generated yet (npm run gtfs).</p>}
      <main>
        {!vehicles.data && !vehicles.error ? (
          <Loading />
        ) : (
          <LineMap
            line={line}
            vehicles={vehicles.data?.vehicles ?? []}
            departures={departures.data?.stations}
            closedStretches={(alerts.data?.alerts ?? [])
              .filter((a) => a.stretch && (!a.start || a.start <= now))
              .map((a) => a.stretch!)}
            now={now}
            selected={selected}
            nearest={nearestId}
            onSelect={select}
            board={
              selected && (
                <StationBoard
                  line={line}
                  stationName={line.stations.find((s) => s.id === selected)?.name ?? selected}
                  departures={departures.data?.stations[selected]}
                  stationIndex={line.stations.findIndex((s) => s.id === selected)}
                  vehicles={vehicles.data?.vehicles ?? []}
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
