import type { DepartureDto, LineConfig } from "../shared/types";

interface Props {
  line: LineConfig;
  departures: DepartureDto[] | undefined;
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

/** The "following trains" list from a Metro platform display, in the line's colour. */
export function StationBoard({ line, departures, now, onClose }: Props) {
  // Shared-line trains can terminate off our line, in which case the destination is already a name.
  const name = (id: string | null) => line.stations.find((s) => s.id === id)?.name ?? id ?? "";
  const upcoming = (departures ?? []).filter((d) => d.time >= now - 30).slice(0, 4);

  return (
    <div className="pid" role="dialog" aria-label="Next trains" style={{ borderTopColor: line.colour }}>
      <button className="pid-close" onClick={onClose} aria-label="Close">
        ×
      </button>
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
