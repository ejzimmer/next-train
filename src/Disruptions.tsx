import type { AlertDto, LineConfig } from "../shared/types";
import { calendarWeeks, disruptedDays } from "./calendar";

interface Props {
  line: LineConfig;
  alerts: AlertDto[] | undefined;
  now: number;
}

const clock = new Intl.DateTimeFormat("en-AU", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Australia/Melbourne",
});
const time = (unix: number) => clock.format(unix * 1000).replace(/\s/g, "").replace(":00", "").toLowerCase();
const monthName = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleString("en-AU", { month: "long", timeZone: "UTC" });
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function headline(alert: AlertDto, name: (id: string) => string) {
  if (alert.kind === "buses" && alert.stretch)
    return { title: "Buses replace trains", sub: `between ${name(alert.stretch.from)} and ${name(alert.stretch.to)}` };
  if (alert.kind === "loop") return { title: "No City Loop", sub: null };
  return { title: alert.header.replace(/^planned works?:?\s*/i, "") || "Disruption", sub: null };
}

function Calendar({ alert, now }: { alert: AlertDto; now: number }) {
  const days = disruptedDays(alert.periods, now);
  const weeks = calendarWeeks(days.keys());
  if (!weeks.length) return null;
  const months = [...new Set(weeks.flat().filter((d) => days.has(d)).map(monthName))];
  return (
    <div className="cal">
      <div className="cal-month">{months.join(" and ")}</div>
      <div className="cal-grid">
        {DAYS.map((d) => (
          <span key={d} className="cal-head">
            {d}
          </span>
        ))}
        {weeks.flat().map((d) => {
          const kind = days.get(d);
          return (
            <span key={d} className={`cal-day${kind ? ` ${kind}` : ""}`} title={kind === "night" ? "Night only" : kind && "All day"}>
              {kind === "night" && <span className="moon" aria-label="night only">☾</span>}
              {Number(d.slice(8))}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function Notice({ line, alert, now }: { line: LineConfig; alert: AlertDto; now: number }) {
  const name = (id: string) => line.stations.find((s) => s.id === id)?.name ?? id;
  const { title, sub } = headline(alert, name);
  const days = disruptedDays(alert.periods, now);
  const nightOnly = days.size > 0 && [...days.values()].every((k) => k === "night");
  const live = !alert.start || alert.start <= now;
  // When the trains stop each night, from the same periods the calendar uses.
  const firstStart = Math.min(...alert.periods.map((p) => p.start ?? Infinity));
  const after = nightOnly && Number.isFinite(firstStart) ? `after ${time(firstStart)}` : null;
  return (
    <section className={`notice${live ? " live" : ""}`}>
      <h2>
        {title}
        {!sub && after && <span className="notice-after"> {after}</span>}
      </h2>
      {sub && (
        <p className="notice-sub">
          {sub}
          {after && ` ${after}`}
        </p>
      )}
      <Calendar alert={alert} now={now} />
      <details>
        <summary>Details</summary>
        <p>{alert.description}</p>
        {alert.url && (
          <p>
            <a href={alert.url} target="_blank" rel="noreferrer">
              More on transport.vic.gov.au
            </a>
          </p>
        )}
      </details>
    </section>
  );
}

/** All the line's disruptions on one board, styled after Metro's station posters. */
export function Disruptions({ line, alerts, now }: Props) {
  if (!alerts?.length) return null;
  const hasNight = alerts.some((a) => [...disruptedDays(a.periods, now).values()].includes("night"));
  return (
    <aside className="disruptions" aria-label="Disruptions">
      <div className="disruptions-bar">
        <span className="bang" aria-hidden>
          !
        </span>
      </div>
      <div className="disruptions-body">
        {alerts.map((a) => (
          <Notice key={a.id} line={line} alert={a} now={now} />
        ))}
        <ul className="cal-key">
          <li>
            <span className="cal-day all-day" /> All day
          </li>
          {hasNight && (
            <li>
              <span className="cal-day night">
                <span className="moon">☾</span>
              </span>{" "}
              Night only
            </li>
          )}
        </ul>
      </div>
    </aside>
  );
}
