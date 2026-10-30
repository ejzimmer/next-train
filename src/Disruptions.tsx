import { useState } from "react";
import { STATIONS } from "../shared/network";
import type { AlertDto } from "../shared/types";
import { calendarWeeks, disruptedDays } from "./calendar";

interface Props {
  alerts: AlertDto[] | undefined;
  now: number;
}

const COLLAPSED_KEY = "disruptionsCollapsed";

const clock = new Intl.DateTimeFormat("en-AU", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Australia/Melbourne",
});
const time = (unix: number) => clock.format(unix * 1000).replace(/\s/g, "").replace(":00", "").toLowerCase();
const monthName = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleString("en-AU", { month: "long", timeZone: "UTC" });
/** Filled crescent, drawn rather than a ☾ character so it's solid in every font. */
function Moon() {
  return (
    <svg className="moon" viewBox="0 0 24 24" aria-label="night only" role="img">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" fill="currentColor" />
    </svg>
  );
}

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
              {kind === "night" && <Moon />}
              {Number(d.slice(8))}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function Notice({ alert, now }: { alert: AlertDto; now: number }) {
  const name = (id: string) => STATIONS[id]?.name ?? id;
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

function savedCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

/** All the disruptions on one board, styled after Metro's station posters. The orange bar folds it away. */
export function Disruptions({ alerts, now }: Props) {
  const [collapsed, setCollapsed] = useState(savedCollapsed);
  if (!alerts?.length) return null;
  const toggle = () => {
    setCollapsed(!collapsed);
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? "0" : "1");
    } catch {
      // Not remembered; fine.
    }
  };
  const hasNight = alerts.some((a) => [...disruptedDays(a.periods, now).values()].includes("night"));
  return (
    <aside className={`disruptions${collapsed ? " collapsed" : ""}`} aria-label="Disruptions">
      <button className="disruptions-bar" onClick={toggle} aria-expanded={!collapsed} aria-label="Disruptions">
        <span className="bang" aria-hidden>
          !
        </span>
        <svg className="chevron" viewBox="0 0 24 24" aria-hidden>
          <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className="disruptions-body" hidden={collapsed}>
        {alerts.map((a) => (
          <Notice key={a.id} alert={a} now={now} />
        ))}
        <ul className="cal-key">
          <li>
            <span className="cal-day all-day" /> All day
          </li>
          {hasNight && (
            <li>
              <span className="cal-day night">
                <Moon />
              </span>{" "}
              Night only
            </li>
          )}
        </ul>
      </div>
    </aside>
  );
}
