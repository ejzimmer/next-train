import type { DepartureDto, Direction, LineConfig } from "../shared/types";

interface Props {
  line: LineConfig;
  stationId: string;
  departures: DepartureDto[] | undefined;
  now: number;
  onClose: () => void;
}

const HEADINGS: Record<Direction, string> = { citybound: "To the city", outbound: "Outbound" };

function countdown(time: number, now: number) {
  const mins = Math.floor((time - now) / 60);
  return mins < 1 ? "Now" : `${mins} min`;
}

export function StationPanel({ line, stationId, departures, now, onClose }: Props) {
  const station = line.stations.find((s) => s.id === stationId);
  if (!station) return null;
  const name = (id: string | null) => line.stations.find((s) => s.id === id)?.name ?? "";
  const upcoming = (departures ?? []).filter((d) => d.time >= now - 30);

  return (
    <aside className="panel" aria-label={`${station.name} departures`}>
      <header>
        <h2>{station.name}</h2>
        <button onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>
      {(["citybound", "outbound"] as const).map((dir) => {
        const list = upcoming.filter((d) => d.direction === dir).slice(0, 3);
        return (
          <section key={dir}>
            <h3>{HEADINGS[dir]}</h3>
            {departures === undefined ? (
              <p className="muted">Loading…</p>
            ) : list.length === 0 ? (
              <p className="muted">No trains in the live feed</p>
            ) : (
              <ul>
                {list.map((d) => (
                  <li key={d.tripId} className={d.cancelled ? "cancelled" : undefined}>
                    <span className="when">{countdown(d.time, now)}</span>
                    <span className="dest">{name(d.destination)}</span>
                    {d.platform && <span className="platform">Plat {d.platform}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </aside>
  );
}
