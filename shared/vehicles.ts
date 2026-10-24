import { toNum, type FeedMessage } from "./feed";
import { directionFromBearing, placeOnLine, segmentBearing } from "./position";
import { matchRoute } from "./routes";
import { trainType } from "./trainType";
import type { LineConfig, LineData, VehicleDto, VehiclesResponse } from "./types";

/** Trains further than this from the line (in metres) are left off the map. */
const MAX_OFF_LINE = 1500;
/** Shared-line trains must be closer, so ones that have turned off towards their own line drop out. */
const MAX_OFF_SHARED = 300;

export function buildVehicles(feed: FeedMessage, line: LineConfig, data: LineData): VehiclesResponse {
  const byId = new Map<string, VehicleDto>();
  for (const entity of feed.entity) {
    const v = entity.vehicle;
    const tripId = v?.trip?.tripId;
    const match = matchRoute(v?.trip?.routeId, line);
    if (!v?.position || !tripId || !match) continue;
    const placed = placeOnLine(v.position.latitude, v.position.longitude, line, data);
    if (!placed || placed.offLine > (match.route ? MAX_OFF_SHARED : MAX_OFF_LINE)) continue;
    // A shared-line train placed past the junction is on its own line, not ours.
    if (placed.segment >= match.until) continue;
    const segment = Math.min(placed.segment, line.stations.length - 2);
    const direction =
      data.trips[tripId]?.dir ??
      (v.position.bearing != null
        ? directionFromBearing(v.position.bearing, segmentBearing(segment, line, data))
        : null);
    const id = v.vehicle?.id || entity.id;
    const { type, cars } = trainType(id);
    const timestamp = toNum(v.timestamp);
    // The same train can briefly be reported against its old and next trip: keep the newer report.
    const existing = byId.get(id);
    if (existing && existing.timestamp >= timestamp) continue;
    byId.set(id, {
      id,
      tripId,
      route: match.route,
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
