import { toNum, type FeedMessage } from "./feed";
import { directionFromBearing, placeOnLine, segmentBearing } from "./position";
import { isLineRoute } from "./routes";
import { trainType } from "./trainType";
import type { LineConfig, LineData, VehicleDto, VehiclesResponse } from "./types";

/** Trains further than this from the line (in metres) are left off the map. */
const MAX_OFF_LINE = 1500;

/** Scheduled start of a trip, in seconds after midnight (-1 when unknown). */
function startOf(tripId: string, data: LineData) {
  return data.times?.trips[tripId]?.[1] ?? -1;
}

export function buildVehicles(feed: FeedMessage, line: LineConfig, data: LineData): VehiclesResponse {
  const byId = new Map<string, VehicleDto>();
  for (const entity of feed.entity) {
    const v = entity.vehicle;
    const tripId = v?.trip?.tripId;
    if (!v?.position || !tripId || !isLineRoute(v.trip?.routeId, line)) continue;
    const placed = placeOnLine(v.position.latitude, v.position.longitude, line, data);
    if (!placed || placed.offLine > MAX_OFF_LINE) continue;
    const segment = placed.segment;
    const direction =
      data.trips[tripId]?.dir ??
      (v.position.bearing != null
        ? directionFromBearing(v.position.bearing, segmentBearing(segment, line, data))
        : null);
    const id = v.vehicle?.id || entity.id;
    const { type, cars } = trainType(id);
    const timestamp = toNum(v.timestamp);
    // The same train can be reported against its old and next trip: keep the newer report, or
    // when both carry the same time, the later-starting trip, so the map doesn't flip between them.
    const existing = byId.get(id);
    if (existing && existing.timestamp > timestamp) continue;
    if (existing && existing.timestamp === timestamp && startOf(existing.tripId, data) >= startOf(tripId, data)) continue;
    byId.set(id, {
      id,
      tripId,
      line: line.id,
      destination: data.trips[tripId]?.dest ?? null,
      timestamp,
      direction,
      segment,
      fraction: placed.fraction,
      trainType: type,
      cars,
    });
  }
  return { feedTimestamp: toNum(feed.header.timestamp), vehicles: [...byId.values()] };
}
