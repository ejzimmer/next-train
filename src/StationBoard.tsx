import type { DepartureDto, LineConfig, VehicleDto } from "../shared/types";

interface Props {
  line: LineConfig;
  stationName: string;
  departures: DepartureDto[] | undefined;
  /** The selected station's index on the line. */
  stationIndex: number;
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
function stillDue(d: DepartureDto, stationIndex: number, vehicles: VehicleDto[], now: number) {
  if (d.time >= now - 30) return true;
  const v = vehicles.find((x) => x.tripId === d.tripId);
  if (!v || !d.direction) return false;
  const at = v.segment + v.fraction;
  return d.direction === "outbound" ? at < stationIndex + 0.05 : at > stationIndex - 0.05;
}

/** The "following trains" list from a Metro platform display, in the line's colour. */
export function StationBoard({ line, stationName, departures, stationIndex, vehicles, now, onClose }: Props) {
  // Shared-line trains can terminate off our line, in which case the destination is already a name.
  const name = (id: string | null) => line.stations.find((s) => s.id === id)?.name ?? id ?? "";
  const upcoming = (departures ?? []).filter((d) => stillDue(d, stationIndex, vehicles, now)).slice(0, 4);

  return (
    <div className="pid" role="dialog" aria-label={`Next trains from ${stationName}`} style={{ borderTopColor: line.colour }}>
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
          <div key={d.tripId} className={`pid-row${d.cancelled ? " cancelled" : ""}`} style={{ borderLeftColor: line.colour }}>
            <span className="pid-time">{formatTime(d.time)}</span>
            <span className="pid-dest" title={d.route ? `${d.route} line` : undefined}>
              {name(d.destination)}
            </span>
            {d.platform && <span className="pid-detail">Plat {d.platform}</span>}
            <span className="pid-mins">{d.cancelled ? "Cancelled" : minutes(d.time, now)}</span>
          </div>
        ))
      )}
    </div>
  );
}
