import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { toNum, type FeedMessage } from "./feed";
import type { AlertDto, AlertsResponse, LineConfig, LineData } from "./types";

const { Alert } = GtfsRealtimeBindings.transit_realtime;

/** Alerts starting further ahead than this are left out. */
const LOOKAHEAD = 7 * 24 * 3600;

/** Effects about station facilities (car parks, lifts) rather than trains running: left out. */
const NOTICE_EFFECTS = new Set(["OTHER_EFFECT", "UNKNOWN_EFFECT", "NO_EFFECT", "ACCESSIBILITY_ISSUE"]);

/** Where buses replace trains, e.g. "Buses replace trains between Heidelberg and Greensborough due to a track fault"
 * (also "...between Heidelberg to Greensborough"). The stations are read off the line, as the sentence carries on after them. */
const BUSES = /buses replace trains between /gi;

/** Line suspended without buses, e.g. "Hurstbridge line suspended between Eltham and Hurstbridge". */
const SUSPENDED = /(?:suspended|no trains(?: run)?) between /gi;

/** The trains still running on part of the line, e.g. "A train service will operate between Flinders Street and Eltham". */
const TRAINS = /(?:trains? services? (?:will )?(?:operates?|runs?)|trains (?:will )?run) between /gi;

/** City Loop closures: "Trains run direct to and from Flinders Street, not via the City Loop", "No City Loop trains". */
const NO_LOOP = /not via the city loop|no city loop|direct to and from flinders street/i;

const text = (t: GtfsRealtimeBindings.transit_realtime.ITranslatedString | null | undefined) =>
  t?.translation?.find((x) => !x.language || x.language === "en")?.text?.trim() ?? "";

type Stretch = NonNullable<AlertDto["stretch"]>;

/** The line's station that `s` starts with (the longest name, so "Flinders Street" beats a shorter one), and its length. */
function stationAt(s: string, line: LineConfig): { index: number; length: number } | null {
  let best: { index: number; length: number } | null = null;
  line.stations.forEach((st, index) => {
    for (const n of [st.name, st.gtfsName]) {
      if (!n || !s.toLowerCase().startsWith(n.toLowerCase())) continue;
      // A whole word only: "Eltham" in "Eltham area", not a station called "Elt" in "Eltham".
      if (/^[a-z']/i.test(s.slice(n.length))) continue;
      if (!best || n.length > best.length) best = { index, length: n.length };
    }
  });
  return best;
}

/** The first "<phrase>X and Y" (or "X to Y") naming two of the line's stations, city end first. */
function between(s: string, phrase: RegExp, line: LineConfig): Stretch | null {
  for (const m of s.matchAll(phrase)) {
    const rest = s.slice(m.index + m[0].length);
    const a = stationAt(rest, line);
    if (!a) continue;
    const join = /^ (?:and|to) /i.exec(rest.slice(a.length));
    const b = join && stationAt(rest.slice(a.length + join[0].length), line);
    if (!b || a.index === b.index) continue;
    return { from: line.stations[Math.min(a.index, b.index)].id, to: line.stations[Math.max(a.index, b.index)].id };
  }
  return null;
}

/**
 * Track with no trains: the bus stretch, cut back to where the shortened train service ends. Trains can run
 * into it (Flinders Street to Eltham with buses from Greensborough) or stop short of it, leaving a gap.
 */
function noTrains(buses: Stretch, trains: Stretch | null, line: LineConfig): Stretch {
  if (!trains) return buses;
  const at = (id: string) => line.stations.findIndex((s) => s.id === id);
  const [b0, b1, t0, t1] = [buses.from, buses.to, trains.from, trains.to].map(at);
  if (t0 <= b0 && t1 < b1) return { from: trains.to, to: buses.to };
  if (t1 >= b1 && t0 > b0) return { from: buses.from, to: trains.from };
  return buses;
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
    const both = `${header}\n${description}`;
    const buses = between(both, BUSES, line);
    const suspended = !buses ? between(both, SUSPENDED, line) : null;
    const trains = buses || suspended ? between(both, TRAINS, line) : null;
    const loop = !buses && !suspended && NO_LOOP.test(both);
    const kind: AlertDto["kind"] = buses ? "buses" : suspended ? "suspended" : loop ? "loop" : "other";
    const closed = buses ?? suspended;
    const stretch = closed
      ? noTrains(closed, trains, line)
      : loop && line.cityLoop
        ? { from: line.cityLoop[0], to: line.cityLoop[1] }
        : null;
    const stations = [
      ...new Set(entities.map((e) => stationOf.get(e.stopId ?? "")).filter((s): s is string => !!s)),
    ];
    const key = closed
      ? `${kind}:${closed.from}:${closed.to}:${trains?.from}:${trains?.to}`
      : stretch
        ? `${kind}:${stretch.from}:${stretch.to}`
        : both;
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
      closed,
      trains,
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
