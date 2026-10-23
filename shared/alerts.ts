import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { toNum, type FeedMessage } from "./feed";
import type { AlertDto, AlertsResponse, LineConfig, LineData } from "./types";

const { Alert } = GtfsRealtimeBindings.transit_realtime;

/** Alerts starting further ahead than this are left out. */
const LOOKAHEAD = 7 * 24 * 3600;

/** Effects about station facilities (car parks, lifts) rather than trains running: left out. */
const NOTICE_EFFECTS = new Set(["OTHER_EFFECT", "UNKNOWN_EFFECT", "NO_EFFECT", "ACCESSIBILITY_ISSUE"]);

/** Metro words bus replacements the same way in headers and descriptions, e.g.
 * "Buses replace trains between Heidelberg and Greensborough" or "...between Heidelberg to Greensborough". */
const BUSES = /buses replace trains between ([a-z' -]+?) (?:and|to) ([a-z' -]+?)(?=$|[,.]| from | \d)/i;

/** City Loop closures: "Trains run direct to and from Flinders Street, not via the City Loop", "No City Loop trains". */
const NO_LOOP = /not via the city loop|no city loop|direct to and from flinders street/i;

const text = (t: GtfsRealtimeBindings.transit_realtime.ITranslatedString | null | undefined) =>
  t?.translation?.find((x) => !x.language || x.language === "en")?.text?.trim() ?? "";

function parseBuses(s: string, line: LineConfig): AlertDto["stretch"] {
  const m = BUSES.exec(s);
  if (!m) return null;
  const index = (name: string) =>
    line.stations.findIndex((st) => [st.name, st.gtfsName].some((n) => n?.toLowerCase() === name.trim().toLowerCase()));
  const [a, b] = [index(m[1]), index(m[2])];
  if (a < 0 || b < 0) return null;
  return { from: line.stations[Math.min(a, b)].id, to: line.stations[Math.max(a, b)].id };
}

/**
 * Current and coming week's train disruptions for the line, including its rail replacement buses
 * (route ids like aus:vic:vic-02-HBE-R:). The feed repeats each alert per route, and often posts the
 * same works twice (a "Planned Works" alert and a "Planned work: ..." one), so duplicates are merged.
 */
export function buildAlerts(feed: FeedMessage, line: LineConfig, data: LineData, now: number): AlertsResponse {
  const own = line.routeIdMatch.replace(/:$/, "");
  const stationOf = new Map<string, string>();
  for (const s of line.stations) data.stations[s.id]?.stopIds.forEach((stop) => stationOf.set(stop, s.id));

  const merged = new Map<string, AlertDto>();
  for (const entity of feed.entity) {
    const a = entity.alert;
    const entities = a?.informedEntity ?? [];
    if (!a || !entities.some((e) => e.routeId?.includes(own))) continue;
    const effect = Alert.Effect[a.effect ?? Alert.Effect.UNKNOWN_EFFECT] ?? "UNKNOWN_EFFECT";
    if (NOTICE_EFFECTS.has(effect)) continue;

    // Periods still to finish and starting within the week; the first is the one running now or next.
    const periods = (a.activePeriod ?? [])
      .map((p) => ({ start: toNum(p.start) || null, end: toNum(p.end) || null }))
      .filter((p) => (!p.end || p.end > now) && (!p.start || p.start <= now + LOOKAHEAD))
      .sort((x, y) => (x.start ?? 0) - (y.start ?? 0));
    if (!periods.length && a.activePeriod?.length) continue;
    const period = periods[0] ?? { start: null, end: null };

    const header = text(a.headerText);
    const description = text(a.descriptionText);
    const buses = parseBuses(header, line) ?? parseBuses(description, line);
    const loop = !buses && NO_LOOP.test(`${header} ${description}`);
    const kind: AlertDto["kind"] = buses ? "buses" : loop ? "loop" : "other";
    const stretch = buses ?? (loop && line.cityLoop ? { from: line.cityLoop[0], to: line.cityLoop[1] } : null);
    const stations = [
      ...new Set(entities.map((e) => stationOf.get(e.stopId ?? "")).filter((s): s is string => !!s)),
    ];
    const key = stretch ? `${kind}:${stretch.from}:${stretch.to}` : `${header}\n${description}`;
    const alert: AlertDto = {
      id: entity.id,
      kind,
      header,
      description,
      url: text(a.url) || null,
      effect,
      start: period.start,
      end: period.end,
      periods,
      stations,
      stretch,
    };
    const existing = merged.get(key);
    merged.set(key, existing ? merge(existing, alert) : alert);
  }

  const alerts = [...merged.values()].sort((x, y) => (x.start ?? 0) - (y.start ?? 0));
  return { feedTimestamp: toNum(feed.header.timestamp), alerts };
}

/**
 * Two alerts about the same works. The "Planned work: ..." one has the better header and the real start
 * (the generic "Planned Works" one goes live a couple of hours early); the generic one has the fuller description.
 */
function merge(a: AlertDto, b: AlertDto): AlertDto {
  const generic = (x: AlertDto) => /^planned works?$/i.test(x.header);
  const [main, other] = generic(a) && !generic(b) ? [b, a] : [a, b];
  return {
    ...main,
    description: other.description.length > main.description.length ? other.description : main.description,
    url: main.url ?? other.url,
    stations: [...new Set([...main.stations, ...other.stations])],
  };
}
