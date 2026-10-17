import { toNum, type FeedMessage } from "./feed";
import { directionFromBearing, placeOnLine, segmentBearing } from "./position";
import type { LineConfig, LineData, VehicleDto, VehiclesResponse } from "./types";

/** Trains further than this from the line (in metres) are left off the map. */
const MAX_OFF_LINE = 1500;

export function buildVehicles(feed: FeedMessage, line: LineConfig, data: LineData): VehiclesResponse {
  const vehicles: VehicleDto[] = [];
  for (const entity of feed.entity) {
    const v = entity.vehicle;
    const tripId = v?.trip?.tripId;
    if (!v?.position || !tripId || !v.trip?.routeId?.includes(line.routeIdMatch)) continue;
    const placed = placeOnLine(v.position.latitude, v.position.longitude, line, data);
    if (!placed || placed.offLine > MAX_OFF_LINE) continue;
    const segment = Math.min(placed.segment, line.stations.length - 2);
    const direction =
      data.trips[tripId]?.dir ??
      (v.position.bearing != null
        ? directionFromBearing(v.position.bearing, segmentBearing(segment, line, data))
        : null);
    vehicles.push({
      id: v.vehicle?.id || entity.id,
      tripId,
      timestamp: toNum(v.timestamp),
      direction,
      segment,
      fraction: placed.fraction,
    });
  }
  return { feedTimestamp: toNum(feed.header.timestamp), vehicles };
}
