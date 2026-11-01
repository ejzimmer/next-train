import { progress } from "../shared/routes";
import type { DepartureDto, LineConfig, VehicleDto } from "../shared/types";
import { useNetwork } from "./networks";

interface Props {
  stationId: string;
  /** Colour along the top: the line's, or the first line's at a station on several. */
  colour: string;
  /** Departures on the lines switched on. */
  departures: DepartureDto[] | undefined;
  vehicles: VehicleDto[];
  now: number;
  onClose: () => void;
}

const clock = new Intl.DateTimeFormat("en-AU", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Australia/Melbourne",
});

/** "2:52 pm" → "2:52pm", as the platform displays write it. */
export const formatTime = (unix: number) => clock.format(unix * 1000).replace(/\s/g, "").toLowerCase();

function minutes(time: number, now: number) {
  const mins = Math.floor((time - now) / 60);
  return mins < 1 ? "Now" : `${mins} min`;
}

/** How late a departure in the city can be and still be listed (see stillDue). */
const CITY_GRACE = 2 * 60;

/**
 * Whether a departure should still be listed. Predictions can pass while the train is still at the platform
 * (or hasn't reported for a while), so a late one stays up as "Now" until its train is seen past the station.
 */
function stillDue(d: DepartureDto, stationId: string, vehicles: VehicleDto[], now: number, lineById: Record<string, LineConfig>) {
  if (d.time >= now - 30) return true;
  const v = vehicles.find((x) => x.tripId === d.tripId);
  // The train can be drawn on another branch of its line, where the stations are in another order.
  const line = v?.line === d.line ? lineById[d.line] : null;
  if (!v || !d.direction || !line) return false;
  const index = (id: string) => line.stations.findIndex((s) => s.id === id);
  const stationIndex = index(stationId);
  // Round the City Loop (run either way depending on the time of day), or between the ends of a track
  // that skips stations, the order of the stations isn't the order the train passes them: just allow
  // a couple of minutes' lateness there.
  const loopEnd = line.cityLoop ? index(line.cityLoop[1]) : -1;
  const skipped = line.track.some(({ from, to }) => {
    const [a, b] = [index(from), index(to)].sort((x, y) => x - y);
    return a < stationIndex && stationIndex < b;
  });
  if (stationIndex >= 0 && (stationIndex <= loopEnd || skipped)) return d.time >= now - CITY_GRACE;
  const at = progress(line, v.segment, v.fraction);
  return d.direction === "outbound" ? at < stationIndex + 0.05 : at > stationIndex - 0.05;
}

/** The "following trains" list from a Metro platform display, each row in its line's colour. */
export function StationBoard({ stationId, colour, departures, vehicles, now, onClose }: Props) {
  const { stations, lineById, city } = useNetwork();
  // A destination off the line (e.g. a Stony Point train running on) is already a name.
  const name = (id: string | null) => stations[id ?? ""]?.name ?? id ?? "";
  const stationName = name(stationId);
  const upcoming = (departures ?? []).filter((d) => stillDue(d, stationId, vehicles, now, lineById)).slice(0, 4);
  if (city === "sydney") return <SydneyBoard {...{ stationName, departures, upcoming, now, onClose, name }} />;

  return (
    <div className="pid" role="dialog" aria-label={`Next trains from ${stationName}`} style={{ borderTopColor: colour }}>
      <button className="pid-close" onClick={onClose} aria-label="Close">
        ×
      </button>
      <h2 className="pid-station">{stationName}</h2>
      {departures === undefined ? (
        <p className="pid-empty">Loading…</p>
      ) : upcoming.length === 0 ? (
        <p className="pid-empty">No trains in the live feed</p>
      ) : (
        upcoming.map((d) => (
          <div key={d.tripId} className={`pid-row${d.cancelled ? " cancelled" : ""}`} style={{ borderLeftColor: lineById[d.line]?.colour }}>
            <span className="pid-time">{formatTime(d.time)}</span>
            <span className="pid-dest">{name(d.destination)}</span>
            {d.platform && <span className="pid-detail">Plat {d.platform}</span>}
            <span className="pid-mins">{d.cancelled ? "Cancelled" : minutes(d.time, now)}</span>
          </div>
        ))
      )}
    </div>
  );
}

const sydneyClock = new Intl.DateTimeFormat("en-AU", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Australia/Sydney",
});
/** "2:52", as Sydney's displays write it. */
const sydneyTime = (unix: number) => sydneyClock.format(unix * 1000).replace(/\s?[ap]m$/i, "");

/** A line's pictogram: a rounded square for trains, a circle for light rail. */
export function LinePictogram({ lineId }: { lineId: string }) {
  const { lineById, switches } = useNetwork();
  const line = lineById[lineId];
  if (!line) return null;
  const label = switches.find((s) => s.id === line.switchId)?.name ?? line.name;
  return (
    <span className={`pictogram${line.mode === "light-rail" ? " round" : ""}`} style={{ background: line.colour, color: line.textColour }}>
      <span>{label}</span>
    </span>
  );
}

interface SydneyProps {
  stationName: string;
  departures: DepartureDto[] | undefined;
  upcoming: DepartureDto[];
  now: number;
  onClose: () => void;
  name: (id: string | null) => string;
}

/** After a Sydney Trains platform display: the next service in full, then the following ones. */
function SydneyBoard({ stationName, departures, upcoming, now, onClose, name }: SydneyProps) {
  const { lineById } = useNetwork();
  const [next, ...following] = upcoming;
  const lightRail = upcoming.length > 0 && upcoming.every((d) => lineById[d.line]?.mode === "light-rail");
  const departs = (d: DepartureDto) => (d.cancelled ? "Cancelled" : minutes(d.time, now));
  return (
    <div className={`syd-pid${lightRail ? " light-rail" : ""}`} role="dialog" aria-label={`Next services from ${stationName}`}>
      <button className="pid-close" onClick={onClose} aria-label="Close">
        ×
      </button>
      <div className="syd-bar">
        <h2>{stationName}</h2>
        <span className="syd-now">{sydneyTime(now)}</span>
      </div>
      {departures === undefined ? (
        <p className="syd-empty">Loading…</p>
      ) : !next ? (
        <p className="syd-empty">No services in the live feed</p>
      ) : (
        <>
          <div className={`syd-next${next.cancelled ? " cancelled" : ""}`}>
            <LinePictogram lineId={next.line} />
            <div className="syd-stack">
              <span className="syd-time">{sydneyTime(next.time)}</span>
              <span className="syd-dest">{name(next.destination)}</span>
            </div>
            <div className="syd-pairs">
              {next.platform && (
                <div className="syd-pair">
                  <span className="syd-title">Platform</span>
                  <span className="syd-value">{next.platform}</span>
                </div>
              )}
              <div className="syd-pair">
                <span className="syd-title">Departs</span>
                <span className="syd-value">{departs(next)}</span>
              </div>
            </div>
          </div>
          {following.length > 0 && (
            <div className="syd-following">
              {following.map((d) => (
                <div key={d.tripId} className={`syd-row${d.cancelled ? " cancelled" : ""}`}>
                  <LinePictogram lineId={d.line} />
                  <span className="syd-row-dest">{name(d.destination)}</span>
                  <span className="syd-row-plat">{d.platform}</span>
                  <span className="syd-row-mins">{departs(d)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
