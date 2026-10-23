import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { toNum, type FeedMessage } from "./feed";
import type { AlertDto, AlertsResponse, LineConfig, LineData } from "./types";

const { Alert } = GtfsRealtimeBindings.transit_realtime;

/** Alerts starting further ahead than this are left out. */
const LOOKAHEAD = 7 * 24 * 3600;

const text = (t: GtfsRealtimeBindings.transit_realtime.ITranslatedString | null | undefined) =>
  t?.translation?.find((x) => !x.language || x.language === "en")?.text?.trim() ?? "";

/**
 * Current and coming week's alerts for the line, including its rail replacement buses
 * (route ids like aus:vic:vic-02-HBE-R:). The feed repeats one alert per route, so duplicates are merged.
 */
export function buildAlerts(feed: FeedMessage, line: LineConfig, data: LineData, now: number): AlertsResponse {
  const own = line.routeIdMatch.replace(/:$/, "");
  const stationOf = new Map<string, string>();
  for (const s of line.stations) data.stations[s.id]?.stopIds.forEach((stop) => stationOf.set(stop, s.id));

  const byText = new Map<string, AlertDto>();
  for (const entity of feed.entity) {
    const a = entity.alert;
    const entities = a?.informedEntity ?? [];
    if (!a || !entities.some((e) => e.routeId?.includes(own))) continue;

    // The period that is running now, else the next one to start.
    const periods = (a.activePeriod ?? [])
      .map((p) => ({ start: toNum(p.start) || null, end: toNum(p.end) || null }))
      .filter((p) => !p.end || p.end > now)
      .sort((x, y) => (x.start ?? 0) - (y.start ?? 0));
    const period = periods.length ? periods[0] : a.activePeriod?.length ? null : { start: null, end: null };
    if (!period || (period.start && period.start > now + LOOKAHEAD)) continue;

    const header = text(a.headerText);
    const description = text(a.descriptionText);
    const key = `${header}\n${description}`;
    const stations = [
      ...new Set(entities.map((e) => stationOf.get(e.stopId ?? "")).filter((s): s is string => !!s)),
    ];
    const existing = byText.get(key);
    if (existing) {
      existing.stations = [...new Set([...existing.stations, ...stations])];
      continue;
    }
    byText.set(key, {
      id: entity.id,
      header,
      description,
      url: text(a.url) || null,
      effect: Alert.Effect[a.effect ?? Alert.Effect.UNKNOWN_EFFECT] ?? "UNKNOWN_EFFECT",
      start: period.start,
      end: period.end,
      stations,
    });
  }

  const alerts = [...byText.values()].sort((x, y) => (x.start ?? 0) - (y.start ?? 0));
  return { feedTimestamp: toNum(feed.header.timestamp), alerts };
}
