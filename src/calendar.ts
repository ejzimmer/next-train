const parts = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Melbourne",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});

/** Melbourne date ("2026-10-23") and hour for a unix time. */
function local(unix: number) {
  const p = Object.fromEntries(parts.formatToParts(unix * 1000).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

const STEP = 30 * 60;
/** Trains running after midnight belong to the previous day's service, as on Metro's posters. */
const SERVICE_DAY_ENDS = 4;

export type DayKind = "all-day" | "night";

/**
 * Which days a disruption touches, and whether it's only at night (as on Metro's "after 8.30pm" posters)
 * or covers the daytime too.
 */
export function disruptedDays(periods: { start: number | null; end: number | null }[], now: number) {
  const days = new Map<string, DayKind>();
  for (const p of periods) {
    const start = p.start ?? now;
    // Open-ended alerts: show the coming week.
    const end = p.end ?? now + 7 * 24 * 3600;
    for (let t = start; t < end; t += STEP) {
      const { date } = local(t - SERVICE_DAY_ENDS * 3600);
      const { hour } = local(t);
      const daytime = hour >= 9 && hour < 17;
      if (daytime) days.set(date, "all-day");
      else if (!days.has(date)) days.set(date, "night");
    }
  }
  return days;
}

const addDays = (date: string, n: number) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const weekday = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0

/** Whole Monday-to-Sunday weeks covering the given days. */
export function calendarWeeks(days: Iterable<string>): string[][] {
  const sorted = [...days].sort();
  if (!sorted.length) return [];
  const first = addDays(sorted[0], -weekday(sorted[0]));
  const last = sorted[sorted.length - 1];
  const weeks: string[][] = [];
  for (let d = first; d <= last; d = addDays(d, 7)) weeks.push([...Array(7)].map((_, i) => addDays(d, i)));
  return weeks;
}
