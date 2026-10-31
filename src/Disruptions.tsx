import { useState } from "react";
import { LINES, STATIONS } from "../shared/network";
import type { AlertDto, LineConfig } from "../shared/types";
import { calendarWeeks, disruptedDays } from "./calendar";

interface Props {
  /** Each alert with the lines it's on. */
  alerts: { alert: AlertDto; lines: LineConfig[] }[] | undefined;
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
  const span = (s: { from: string; to: string }) => `between ${name(s.from)} and ${name(s.to)}`;
  if (alert.kind === "buses" && alert.stretch) return { title: "Buses replace trains", sub: span(alert.stretch) };
  if (alert.kind === "suspended" && alert.stretch) return { title: "No trains", sub: span(alert.stretch) };
  if (alert.kind === "loop") return { title: "No City Loop", sub: null };
  const shortRuns = alert.shortRuns.length
    ? `Some trains start or end at ${new Intl.ListFormat("en-AU", { type: "disjunction" }).format(alert.shortRuns.map(name))}`
    : null;
  if (alert.kind === "delays") return { title: `Delays up to ${alert.delay} minutes`, sub: shortRuns };
  return { title: alert.header.replace(/^planned works?:?\s*/i, "") || "Disruption", sub: shortRuns };
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

/** What a notice shows above its details. */
function summary(alert: AlertDto, now: number) {
  const name = (id: string) => STATIONS[id]?.name ?? id;
  const { title, sub } = headline(alert, name);
  const days = disruptedDays(alert.periods, now);
  const nightOnly = days.size > 0 && [...days.values()].every((k) => k === "night");
  // When the trains stop each night, from the same periods the calendar uses.
  const firstStart = Math.min(...alert.periods.map((p) => p.start ?? Infinity));
  const after = nightOnly && Number.isFinite(firstStart) ? `after ${time(firstStart)}` : null;
  return { title, sub, after, days };
}

interface Merged {
  /** What the merged alerts have in common. */
  id: string;
  alert: AlertDto;
  lines: LineConfig[];
  /** Every different description among the alerts merged into this notice. */
  descriptions: string[];
}

/** Alerts that would show the same notice (e.g. each line's "No City Loop" for the same nights) become one. */
function mergeAlike(alerts: { alert: AlertDto; lines: LineConfig[] }[], now: number): Merged[] {
  const byKey = new Map<string, Merged>();
  for (const { alert, lines } of alerts) {
    const { title, sub, after, days } = summary(alert, now);
    // The same alert on several lines (whatever its times on each), or different alerts that read the same.
    const keys = [JSON.stringify([alert.id, title, sub]), JSON.stringify([title, sub, after, [...days]])];
    const merged = keys.map((k) => byKey.get(k)).find(Boolean);
    if (!merged) {
      const m = { id: keys[0], alert, lines: [...lines], descriptions: [alert.description] };
      keys.forEach((k) => byKey.set(k, m));
      continue;
    }
    keys.forEach((k) => byKey.set(k, merged));
    for (const l of lines) if (!merged.lines.includes(l)) merged.lines.push(l);
    if (!merged.descriptions.includes(alert.description)) merged.descriptions.push(alert.description);
  }
  const notices = [...new Set(byKey.values())];
  for (const m of notices) m.lines.sort((a, b) => LINES.indexOf(a) - LINES.indexOf(b));
  return notices;
}

function Notice({ alert, lines, descriptions, now }: Merged & { now: number }) {
  const { title, sub, after } = summary(alert, now);
  const live = !alert.start || alert.start <= now;
  return (
    <section className={`notice${live ? " live" : ""}`}>
      <ul className="notice-lines">
        {lines.map((l) => (
          <li key={l.id} style={{ background: l.colour, color: l.textColour }}>
            {l.name}
          </li>
        ))}
      </ul>
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
        {descriptions.map((d) => (
          <p key={d}>{d}</p>
        ))}
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
  const notices = mergeAlike(alerts, now);
  const hasNight = notices.some(({ alert }) => [...disruptedDays(alert.periods, now).values()].includes("night"));
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
        {notices.map((n) => (
          <Notice key={n.id} {...n} now={now} />
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
