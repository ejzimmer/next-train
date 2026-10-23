import type { AlertDto, LineConfig } from "../shared/types";

interface Props {
  line: LineConfig;
  alerts: AlertDto[] | undefined;
  now: number;
}

const dateTime = new Intl.DateTimeFormat("en-AU", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Australia/Melbourne",
});
const when = (unix: number) => dateTime.format(unix * 1000).replace(/\s(am|pm)$/i, "$1").replace(",", "");

function period(a: AlertDto, now: number) {
  if (a.start && a.start > now) return a.end ? `${when(a.start)} to ${when(a.end)}` : `From ${when(a.start)}`;
  return a.end ? `Now until ${when(a.end)}` : "Now";
}

function Alert({ line, alert, now }: { line: LineConfig; alert: AlertDto; now: number }) {
  const name = (id: string) => line.stations.find((s) => s.id === id)?.name ?? id;
  const title = alert.buses
    ? `Buses replace trains ${name(alert.buses.from)} to ${name(alert.buses.to)}`
    : alert.header.replace(/^planned work:\s*/i, "");
  return (
    <details className="alert">
      <summary>
        <strong>{title}</strong> <span className="alert-when">{period(alert, now)}</span>
      </summary>
      <p>{alert.description}</p>
      {alert.url && (
        <p>
          <a href={alert.url} target="_blank" rel="noreferrer">
            More on transport.vic.gov.au
          </a>
        </p>
      )}
    </details>
  );
}

/** Train disruptions for the line, current ones highlighted; tap one for Metro's full notice. */
export function Disruptions({ line, alerts, now }: Props) {
  if (!alerts?.length) return null;
  const live = (a: AlertDto) => !a.start || a.start <= now;
  return (
    <section className="disruptions" aria-label="Disruptions">
      {alerts.map((a) => (
        <div key={a.id} className={`disruption${live(a) ? " live" : ""}`}>
          <Alert line={line} alert={a} now={now} />
        </div>
      ))}
    </section>
  );
}
