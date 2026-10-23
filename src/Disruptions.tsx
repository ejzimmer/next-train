import type { AlertDto, LineConfig } from "../shared/types";

interface Props {
  line: LineConfig;
  alerts: AlertDto[] | undefined;
  now: number;
}

/** Effects that are about station facilities (car parks, lifts) rather than trains running. */
const NOTICE_EFFECTS = new Set(["OTHER_EFFECT", "UNKNOWN_EFFECT", "NO_EFFECT", "ACCESSIBILITY_ISSUE"]);

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
  const names = alert.stations
    .map((id) => line.stations.find((s) => s.id === id)?.name)
    .filter(Boolean)
    .join(", ");
  return (
    <details className="alert">
      <summary>
        <strong>{alert.header}</strong> <span className="alert-when">{period(alert, now)}</span>
      </summary>
      {names && <p className="alert-stations">{names}</p>}
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

/** Service changes up front; car park and lift notices folded away underneath. */
export function Disruptions({ line, alerts, now }: Props) {
  if (!alerts?.length) return null;
  const service = alerts.filter((a) => !NOTICE_EFFECTS.has(a.effect));
  const notices = alerts.filter((a) => NOTICE_EFFECTS.has(a.effect));
  const live = (a: AlertDto) => !a.start || a.start <= now;
  return (
    <section className="disruptions" aria-label="Disruptions">
      {service.map((a) => (
        <div key={a.id} className={`disruption${live(a) ? " live" : ""}`}>
          <Alert line={line} alert={a} now={now} />
        </div>
      ))}
      {notices.length > 0 && (
        <details className="notices">
          <summary className="muted">Station notices ({notices.length})</summary>
          {notices.map((a) => (
            <Alert key={a.id} line={line} alert={a} now={now} />
          ))}
        </details>
      )}
    </section>
  );
}
