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
  hour12: false,
  timeZone: "Australia/Melbourne",
});

function minutes(time: number, now: number) {
  const mins = Math.floor((time - now) / 60);
  return mins < 1 ? "Now" : `${mins} min`;
}

/** Departures styled like the amber LED passenger information displays on Metro platforms. */
export function StationBoard({ line, departures, now, onClose }: Props) {
  const name = (id: string | null) => line.stations.find((s) => s.id === id)?.name ?? "";
  const upcoming = (departures ?? []).filter((d) => d.time >= now - 30).slice(0, 4);
  const [next, ...later] = upcoming;

  return (
    <div className="pid" role="dialog" aria-label="Next trains">
      <button className="pid-close" onClick={onClose} aria-label="Close">
        ×
      </button>
      {departures === undefined ? (
        <p className="pid-empty">Loading</p>
      ) : !next ? (
        <p className="pid-empty">No trains in the live feed</p>
      ) : (
        <>
          <div className="pid-next">
            <div className="pid-row">
              <span className="pid-time">{clock.format(next.time * 1000)}</span>
              <span className="pid-dest">{name(next.destination)}</span>
              <span className="pid-mins">{next.cancelled ? "Cancelled" : minutes(next.time, now)}</span>
            </div>
            <div className="pid-row pid-sub">
              <span>{next.direction === "citybound" ? "To the city" : next.direction === "outbound" ? "Outbound" : ""}</span>
              {next.platform && <span>Plat {next.platform}</span>}
            </div>
          </div>
          {later.map((d) => (
            <div key={d.tripId} className={`pid-row pid-later${d.cancelled ? " cancelled" : ""}`}>
              <span className="pid-time">{clock.format(d.time * 1000)}</span>
              <span className="pid-dest">{name(d.destination)}</span>
              {d.platform && <span className="pid-plat">P{d.platform}</span>}
              <span className="pid-mins">{d.cancelled ? "Cxl" : minutes(d.time, now)}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
