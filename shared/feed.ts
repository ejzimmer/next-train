import GtfsRealtimeBindings from "gtfs-realtime-bindings";

const { transit_realtime } = GtfsRealtimeBindings;
export type FeedMessage = GtfsRealtimeBindings.transit_realtime.FeedMessage;

const BASE = "https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1";

export type FeedName = "vehicle-positions" | "trip-updates";

export function decodeFeed(bytes: Uint8Array): FeedMessage {
  return transit_realtime.FeedMessage.decode(bytes);
}

export async function fetchFeed(mode: string, feed: FeedName, key: string): Promise<FeedMessage> {
  const res = await fetch(`${BASE}/${mode}/${feed}`, { headers: { KeyID: key } });
  if (!res.ok) throw new Error(`${feed} returned ${res.status}`);
  return decodeFeed(new Uint8Array(await res.arrayBuffer()));
}

/** protobufjs gives uint64 fields as Long objects; everything we read fits in a double. */
export function toNum(v: number | { toString(): string } | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "number" ? v : Number(v.toString());
}
