import { useCallback, useEffect, useMemo, useState } from "react";
import hurstbridge from "../lines/hurstbridge.json";
import stationData from "../data/hurstbridge.stations.json";
import type { DeparturesResponse, LineConfig, VehiclesResponse } from "../shared/types";
import { LineMap } from "./LineMap";
import { StationPanel } from "./StationPanel";
import { useNow, usePoll } from "./usePoll";

const line = hurstbridge as LineConfig;
const POLL_MS = 60_000;

function stationFromUrl() {
  return new URLSearchParams(location.search).get("station");
}

export function App() {
  const [selected, setSelected] = useState<string | null>(stationFromUrl);
  const vehicles = usePoll<VehiclesResponse>(`/api/vehicles?line=${line.id}`, POLL_MS);
  const departures = usePoll<DeparturesResponse>(`/api/departures?line=${line.id}`, POLL_MS);
  const now = useNow(15_000);
  const hasStations = Object.keys(stationData.stations).length > 0;

  const select = useCallback((id: string | null) => {
    setSelected((current) => {
      const next = current === id ? null : id;
      const url = new URL(location.href);
      if (next) url.searchParams.set("station", next);
      else url.searchParams.delete("station");
      history.replaceState(null, "", url);
      return next;
    });
  }, []);

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
      </header>
      {!hasStations && <p className="warning">Station data hasn't been generated yet (npm run gtfs).</p>}
      <main>
        <LineMap line={line} vehicles={vehicles.data?.vehicles ?? []} now={now} selected={selected} onSelect={select} />
        {selected && (
          <StationPanel
            line={line}
            stationId={selected}
            departures={departures.data?.stations[selected]}
            now={now}
            onClose={() => select(null)}
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
