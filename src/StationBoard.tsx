import { LINE_BY_ID, STATIONS } from "../shared/network";
import { progress } from "../shared/routes";
import type { DepartureDto, VehicleDto } from "../shared/types";

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
const formatTime = (unix: number) => clock.format(unix * 1000).replace(/\s/g, "").toLowerCase();

function minutes(time: number, now: number) {
  const mins = Math.floor((time - now) / 60);
  return mins < 1 ? "Now" : `${mins} min`;
}

/**
 * Whether a departure should still be listed. Predictions can pass while the train is still at the platform
 * (or hasn't reported for a while), so a late one stays up as "Now" until its train is seen past the station.
 */
function stillDue(d: DepartureDto, stationId: string, vehicles: VehicleDto[], now: number) {
  if (d.time >= now - 30) return true;
  const v = vehicles.find((x) => x.tripId === d.tripId);
  const line = LINE_BY_ID[d.line];
  if (!v || !d.direction || !line) return false;
  const stationIndex = line.stations.findIndex((s) => s.id === stationId);
  const at = progress(line, v.segment, v.fraction);
  return d.direction === "outbound" ? at < stationIndex + 0.05 : at > stationIndex - 0.05;
}

/** The "following trains" list from a Metro platform display, each row in its line's colour. */
export function StationBoard({ stationId, colour, departures, vehicles, now, onClose }: Props) {
  // A destination off the line (e.g. a Stony Point train running on) is already a name.
  const name = (id: string | null) => STATIONS[id ?? ""]?.name ?? id ?? "";
  const stationName = name(stationId);
  const upcoming = (departures ?? []).filter((d) => stillDue(d, stationId, vehicles, now)).slice(0, 4);

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
          <div key={d.tripId} className={`pid-row${d.cancelled ? " cancelled" : ""}`} style={{ borderLeftColor: LINE_BY_ID[d.line]?.colour }}>
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
