import GtfsRealtimeBindings from "gtfs-realtime-bindings";

const { transit_realtime } = GtfsRealtimeBindings;
export type FeedMessage = GtfsRealtimeBindings.transit_realtime.FeedMessage;

const BASE = "https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1";

export type FeedName = "vehicle-positions" | "trip-updates" | "service-alerts";

export function decodeFeed(bytes: Uint8Array): FeedMessage {
  return transit_realtime.FeedMessage.decode(bytes);
}

/** How long a warm function reuses a feed it fetched, so requests for different stations share one fetch. */
const REUSE_MS = 15_000;
const recent = new Map<string, { at: number; feed: Promise<FeedMessage> }>();

export function fetchFeed(mode: string, feed: FeedName, key: string): Promise<FeedMessage> {
  const url = `${BASE}/${mode}/${feed}`;
  const hit = recent.get(url);
  if (hit && Date.now() - hit.at < REUSE_MS) return hit.feed;
  const fetched = (async () => {
    const res = await fetch(url, { headers: { KeyID: key } });
    if (!res.ok) throw new Error(`${feed} returned ${res.status}`);
    return decodeFeed(new Uint8Array(await res.arrayBuffer()));
  })();
  recent.set(url, { at: Date.now(), feed: fetched });
  fetched.catch(() => recent.get(url)?.feed === fetched && recent.delete(url));
  return fetched;
}

/** protobufjs gives uint64 fields as Long objects; everything we read fits in a double. */
export function toNum(v: number | { toString(): string } | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "number" ? v : Number(v.toString());
}
