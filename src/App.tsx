import { useCallback, useEffect, useMemo, useState } from "react";
import stationData from "../data/stations.json";
import { LINES } from "../shared/network";
import type { NetworkAlertsResponse, StationDeparturesResponse, VehiclesResponse } from "../shared/types";
import { Disruptions } from "./Disruptions";
import { HIDE_AFTER, LineMap } from "./LineMap";
import { LineSwitches } from "./LineSwitches";
import { Loading } from "./Loading";
import { StationBoard } from "./StationBoard";
import { TrainCard } from "./TrainCard";
import { TripFinished } from "./TripFinished";
import { useNearestStation } from "./useNearestStation";
import { useNow, usePoll } from "./usePoll";

/** About three times a minute; the API allows 24 calls a minute per feed. */
const POLL_MS = 20_000;
const ALERTS_POLL_MS = 2 * 60_000;

function stationFromUrl() {
  return new URLSearchParams(location.search).get("station");
}

/** A shared train (?trainid=trip id): opened on its line, boarded. */
function trainFromUrl() {
  return new URLSearchParams(location.search).get("trainid");
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

function setParam(name: string, value: string | null) {
  const url = new URL(location.href);
  if (value) url.searchParams.set(name, value);
  else url.searchParams.delete(name);
  history.replaceState(null, "", url);
}

const showStation = (id: string | null) => setParam("station", id);

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

  // A shared train: once the trains are in, show just its line with it boarded, or say its trip has finished.
  const [linkedTrip] = useState(trainFromUrl);
  const [linked, setLinked] = useState<"waiting" | "found" | "finished" | null>(linkedTrip ? "waiting" : null);
  const [boarded, setBoarded] = useState<string | null>(null);
  useEffect(() => {
    if (linked !== "waiting" || !vehicles.data) return;
    // A train the map would leave off (not heard from for a while) counts as finished too.
    const v = vehicles.data.vehicles.find(
      (x) => x.tripId === linkedTrip && Date.now() / 1000 - x.timestamp <= HIDE_AFTER,
    );
    if (!v) return setLinked("finished");
    setLineIds([v.line]);
    setBoarded(v.tripId);
    setLinked("found");
  }, [linked, linkedTrip, vehicles.data]);
  const board = (tripId: string | null) => {
    setBoarded(tripId);
    if (!tripId) setParam("trainid", null);
  };

  const [selectedTrain, setSelectedTrain] = useState<string | null>(null);
  const departures = usePoll<StationDeparturesResponse>(station && `/api/departures?station=${station}`, POLL_MS);
  const alerts = usePoll<NetworkAlertsResponse>("/api/alerts", ALERTS_POLL_MS);
  const now = useNow(10_000);
  const hasStations = Object.keys(stationData.stations).length > 0;
  const shownVehicles = useMemo(
    () => (vehicles.data?.vehicles ?? []).filter((v) => lineIds.includes(v.line)),
    [vehicles.data, lineIds],
  );
  const shownDepartures = departures.data?.departures.filter((d) => lineIds.includes(d.line));
  // Each line's alerts; Disruptions merges the ones that read the same.
  const shownAlerts = useMemo(
    () =>
      lines
        .flatMap((l) => (alerts.data?.lines[l.id] ?? []).map((alert) => ({ alert, lines: [l] })))
        .sort((x, y) => (x.alert.start ?? 0) - (y.alert.start ?? 0)),
    [alerts.data, lines],
  );
  const closedStretches = lines.flatMap((l) =>
    (alerts.data?.lines[l.id] ?? [])
      .filter((a) => a.stretch && (!a.start || a.start <= now))
      .map((a) => ({ line: l.id, ...a.stretch! })),
  );
  const places = useMemo(() => Object.fromEntries([...onMap].map((id) => [id, PLACES[id]])), [onMap]);

  const select = useCallback((id: string | null) => {
    setSelectedTrain(null);
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      select(null);
      setSelectedTrain(null);
    };
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

  const selectTrain = (tripId: string) => {
    setSelected(null);
    showStation(null);
    setSelectedTrain((current) => (current === tripId ? null : tripId));
  };
  const cardVehicle = shownVehicles.find((v) => v.tripId === selectedTrain);

  if (linked === "finished") return <TripFinished />;

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
        {!vehicles.error && (!vehicles.data || linked === "waiting") ? (
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
            selectedTrain={cardVehicle ? selectedTrain : null}
            onSelectTrain={selectTrain}
            boarded={boarded}
            reveal={linked === "found" ? linkedTrip : null}
            board={
              cardVehicle ? (
                <TrainCard
                  key={cardVehicle.tripId}
                  vehicle={cardVehicle}
                  destination={cardVehicle.destination}
                  now={now}
                  pollMs={POLL_MS}
                  boarded={boarded === cardVehicle.tripId}
                  onBoard={(on) => board(on ? cardVehicle.tripId : null)}
                  onClose={() => setSelectedTrain(null)}
                />
              ) : station && (
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
