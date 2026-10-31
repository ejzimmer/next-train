import { useCallback, useEffect, useMemo, useState } from "react";
import type { City, NetworkAlertsResponse, StationDeparturesResponse, VehiclesResponse } from "../shared/types";
import { Disruptions } from "./Disruptions";
import { HIDE_AFTER, LineMap } from "./LineMap";
import { LineSwitches } from "./LineSwitches";
import { Loading } from "./Loading";
import { CITIES, NETWORKS, NetworkContext, type Network } from "./networks";
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

const NEAREST_KEY = "showNearest";
const CITY_KEY = "city";
/** Each city's switches that are on; Melbourne's key is from before there were other cities. */
const linesKey = (city: City) => (city === "melbourne" ? "lines" : `lines:${city}`);

const isCity = (c: string | null): c is City => CITIES.some((n) => n.city === c);

/** The city in the link (?city=), else the one last shown. */
function startingCity(): City {
  const fromUrl = new URLSearchParams(location.search).get("city");
  if (isCity(fromUrl)) return fromUrl;
  if (trainFromUrl()) return "melbourne";
  try {
    const saved = localStorage.getItem(CITY_KEY);
    if (isCity(saved)) return saved;
  } catch {
    // Fall through to the default.
  }
  return "melbourne";
}

function savedSwitches(network: Network): string[] {
  try {
    const ids = JSON.parse(localStorage.getItem(linesKey(network.city)) ?? "null");
    if (Array.isArray(ids)) return ids.filter((id) => network.switches.some((s) => s.id === id));
  } catch {
    // Fall through to the default.
  }
  return network.defaultSwitches;
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

/** A tab per city; each city's map starts afresh when its tab is chosen. */
export function App() {
  const [city, setCity] = useState(startingCity);
  const choose = (next: City) => {
    if (next === city) return;
    setCity(next);
    try {
      localStorage.setItem(CITY_KEY, next);
    } catch {
      // Not remembered; fine.
    }
    const url = new URL(location.href);
    for (const p of ["station", "trainid", "city"]) url.searchParams.delete(p);
    if (next !== "melbourne") url.searchParams.set("city", next);
    history.replaceState(null, "", url);
  };
  return (
    <NetworkContext.Provider value={NETWORKS[city]}>
      <CityMap key={city} network={NETWORKS[city]} onCity={choose} />
    </NetworkContext.Provider>
  );
}

function CityTabs({ city, onCity }: { city: City; onCity: (city: City) => void }) {
  return (
    <div className="city-tabs" role="tablist" aria-label="City">
      {CITIES.map((n) => (
        <button key={n.city} className="city-tab" role="tab" aria-selected={n.city === city} onClick={() => onCity(n.city)}>
          {n.name}
        </button>
      ))}
    </div>
  );
}

function CityMap({ network, onCity }: { network: Network; onCity: (city: City) => void }) {
  const { city } = network;
  const [selected, setSelected] = useState<string | null>(stationFromUrl);
  const [lineIds, setLineIds] = useState(() => savedSwitches(network));
  const lines = useMemo(() => network.lines.filter((l) => lineIds.includes(l.switchId)), [network, lineIds]);
  const toggleLine = (id: string) => {
    const next = lineIds.includes(id) ? lineIds.filter((x) => x !== id) : [...lineIds, id];
    setLineIds(next);
    try {
      localStorage.setItem(linesKey(city), JSON.stringify(next));
    } catch {
      // Not remembered; fine.
    }
  };
  const onLine = useMemo(() => new Set(lines.map((l) => l.id)), [lines]);
  const onMap = useMemo(() => new Set(lines.flatMap((l) => l.stations.map((s) => s.id))), [lines]);
  const station = selected && onMap.has(selected) ? selected : null;

  const vehicles = usePoll<VehiclesResponse>(`/api/vehicles?city=${city}`, POLL_MS);

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
    setLineIds([network.lineById[v.line].switchId]);
    setBoarded(v.tripId);
    setLinked("found");
  }, [linked, linkedTrip, vehicles.data, network]);
  const board = (tripId: string | null) => {
    setBoarded(tripId);
    if (!tripId) setParam("trainid", null);
  };

  const [selectedTrain, setSelectedTrain] = useState<string | null>(null);
  const departures = usePoll<StationDeparturesResponse>(station && `/api/departures?station=${station}&city=${city}`, POLL_MS);
  const alerts = usePoll<NetworkAlertsResponse>(`/api/alerts?city=${city}`, ALERTS_POLL_MS);
  const now = useNow(10_000);
  const hasStations = Object.keys(network.places).length > 0;
  const shownVehicles = useMemo(
    () => (vehicles.data?.vehicles ?? []).filter((v) => onLine.has(v.line)),
    [vehicles.data, onLine],
  );
  const shownDepartures = departures.data?.departures.filter((d) => onLine.has(d.line));
  // Each line's alerts, with its switch; Disruptions merges the ones that read the same.
  const shownAlerts = useMemo(() => {
    const switchOf = (id: string) => network.switches.find((s) => s.id === id)!;
    return lines
      .flatMap((l) => (alerts.data?.lines[l.id] ?? []).map((alert) => ({ alert, lines: [switchOf(l.switchId)] })))
      .sort((x, y) => (x.alert.start ?? 0) - (y.alert.start ?? 0));
  }, [alerts.data, lines, network]);
  const closedStretches = lines.flatMap((l) =>
    (alerts.data?.lines[l.id] ?? [])
      .filter((a) => a.stretch && (!a.start || a.start <= now))
      .map((a) => ({ line: l.id, ...a.stretch! })),
  );
  const places = useMemo(() => Object.fromEntries([...onMap].map((id) => [id, network.places[id]])), [onMap, network]);

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

  const switchesOn = network.switches.filter((s) => lineIds.includes(s.id));
  return (
    <div className="app">
      <header className="top">
        <CityTabs city={city} onCity={onCity} />
        <div className="title-row">
          <h1>{switchesOn.length === 1 ? switchesOn[0].title : network.title}</h1>
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
      {!hasStations && <p className="warning">Station data hasn't been generated yet (npm run gtfs:{city}).</p>}
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
      <footer className="muted">{network.attribution}</footer>
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
