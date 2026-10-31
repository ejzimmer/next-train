import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { readConsists } from "./tfnsw";
import type { City } from "./types";

const { transit_realtime } = GtfsRealtimeBindings;
export type FeedMessage = GtfsRealtimeBindings.transit_realtime.FeedMessage;

export type FeedKind = "vehicles" | "trips" | "alerts";

const PTV = "https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/metro";
const TFNSW = "https://api.transport.nsw.gov.au";

/** Each city's feeds of each kind; a city with several (Sydney Trains and each light rail line) has them merged. */
const FEEDS: Record<City, Record<FeedKind, string[]>> = {
  melbourne: {
    vehicles: [`${PTV}/vehicle-positions`],
    trips: [`${PTV}/trip-updates`],
    alerts: [`${PTV}/service-alerts`],
  },
  sydney: {
    vehicles: [
      `${TFNSW}/v2/gtfs/vehiclepos/sydneytrains`,
      `${TFNSW}/v2/gtfs/vehiclepos/lightrail/innerwest`,
      `${TFNSW}/v1/gtfs/vehiclepos/lightrail/cbdandsoutheast`,
      `${TFNSW}/v1/gtfs/vehiclepos/lightrail/parramatta`,
    ],
    trips: [
      `${TFNSW}/v2/gtfs/realtime/sydneytrains`,
      `${TFNSW}/v2/gtfs/realtime/lightrail/innerwest`,
      `${TFNSW}/v1/gtfs/realtime/lightrail/cbdandsoutheast`,
      `${TFNSW}/v1/gtfs/realtime/lightrail/parramatta`,
    ],
    alerts: [`${TFNSW}/v2/gtfs/alerts/sydneytrains`, `${TFNSW}/v2/gtfs/alerts/lightrail`],
  },
};

/** The API key's environment variable and how it's sent. */
const KEYS: Record<City, { env: string; header: (key: string) => Record<string, string> }> = {
  melbourne: { env: "PTV_OPENDATA_KEY", header: (key) => ({ KeyID: key }) },
  sydney: { env: "TFNSW_OPENDATA_KEY", header: (key) => ({ Authorization: `apikey ${key}` }) },
};

export function decodeFeed(bytes: Uint8Array): FeedMessage {
  const feed = transit_realtime.FeedMessage.decode(bytes);
  readConsists(bytes, feed);
  return feed;
}

/** How long a warm function reuses a feed it fetched, so requests for different stations share one fetch. */
const REUSE_MS = 15_000;
const recent = new Map<string, { at: number; feed: Promise<FeedMessage> }>();

export function fetchFeed(url: string, headers: Record<string, string>): Promise<FeedMessage> {
  const hit = recent.get(url);
  if (hit && Date.now() - hit.at < REUSE_MS) return hit.feed;
  const fetched = (async () => {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`${url.split("/").slice(-2).join("/")} returned ${res.status}`);
    return decodeFeed(new Uint8Array(await res.arrayBuffer()));
  })();
  const entry = { at: Date.now(), feed: fetched };
  recent.set(url, entry);
  // Fresh from when it arrived; a failure isn't kept.
  fetched.then(
    () => (entry.at = Date.now()),
    () => recent.get(url) === entry && recent.delete(url),
  );
  return fetched;
}

/**
 * A city's feed of one kind, its feeds merged into one. A feed that fails is left out (a light rail line's,
 * say), unless they all do. The timestamp is the newest feed's.
 */
export async function cityFeed(city: City, kind: FeedKind): Promise<FeedMessage> {
  const { env, header } = KEYS[city];
  const key = process.env[env];
  if (!key) throw new Error(`${env} is not set`);
  const results = await Promise.allSettled(FEEDS[city][kind].map((url) => fetchFeed(url, header(key))));
  const feeds = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  if (!feeds.length) throw (results[0] as PromiseRejectedResult).reason;
  if (feeds.length === 1) return feeds[0];
  return transit_realtime.FeedMessage.create({
    header: {
      gtfsRealtimeVersion: feeds[0].header.gtfsRealtimeVersion,
      timestamp: Math.max(...feeds.map((f) => toNum(f.header.timestamp))),
    },
    entity: feeds.flatMap((f) => f.entity),
  });
}

/** protobufjs gives uint64 fields as Long objects; everything we read fits in a double. */
export function toNum(v: number | { toString(): string } | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "number" ? v : Number(v.toString());
}
