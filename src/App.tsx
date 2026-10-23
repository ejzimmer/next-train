import { useCallback, useEffect, useMemo, useState } from "react";
import hurstbridge from "../lines/hurstbridge.json";
import stationData from "../data/hurstbridge.stations.json";
import type { AlertsResponse, DeparturesResponse, LineConfig, VehiclesResponse } from "../shared/types";
import { Disruptions } from "./Disruptions";
import { LineMap } from "./LineMap";
import { StationBoard } from "./StationBoard";
import { useNow, usePoll } from "./usePoll";

const line = hurstbridge as LineConfig;
/** About three times a minute; the API allows 24 calls a minute per feed. */
const POLL_MS = 20_000;
const ALERTS_POLL_MS = 2 * 60_000;

function stationFromUrl() {
  return new URLSearchParams(location.search).get("station");
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
      <Disruptions line={line} alerts={alerts.data?.alerts} now={now} />
      {!hasStations && <p className="warning">Station data hasn't been generated yet (npm run gtfs).</p>}
      <main>
        <LineMap
          line={line}
          vehicles={vehicles.data?.vehicles ?? []}
          busStretches={(alerts.data?.alerts ?? [])
            .filter((a) => a.buses && (!a.start || a.start <= now))
            .map((a) => a.buses!)}
          now={now}
          selected={selected}
          onSelect={select}
          board={
            selected && (
              <StationBoard
                line={line}
                departures={departures.data?.stations[selected]}
                vehicles={vehicles.data?.vehicles ?? []}
                now={now}
                onClose={() => select(null)}
              />
            )
          }
        />
      </main>
      <footer className="muted">
        Source: Licensed from Public Transport Victoria under a Creative Commons Attribution 4.0 International Licence.
        Not affiliated with PTV.
      </footer>
    </div>
  );
}
