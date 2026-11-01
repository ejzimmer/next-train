import { toNum, type FeedMessage } from "./feed";
import { directionFromBearing, placeOnLine, segmentBearing } from "./position";
import { isLineTrip } from "./routes";
import { melbourneTramType, sydneyTrainType, trainType } from "./trainType";
import type { LineConfig, LineData, VehicleDto, VehiclesResponse } from "./types";

/** Trains further than this from the line (in metres) are left off the map. */
const MAX_OFF_LINE = 1500;

/** Scheduled start of a trip, in seconds after midnight (-1 when unknown). */
export function startOf(tripId: string, data: LineData) {
  return data.times?.trips[tripId]?.[1] ?? -1;
}

/** A train placed on one line, with how well it fits there, for choosing between lines (see newestPerTrain). */
export interface PlacedVehicle extends VehicleDto {
  /** Metres from the line. */
  offLine: number;
  /** Whether the line's timetable has the trip. */
  known: boolean;
}

export function buildVehicles(feed: FeedMessage, line: LineConfig, data: LineData): { feedTimestamp: number; vehicles: PlacedVehicle[] } {
  const byId = new Map<string, PlacedVehicle>();
  for (const entity of feed.entity) {
    const v = entity.vehicle;
    const tripId = v?.trip?.tripId;
    if (!v?.position || !tripId || !isLineTrip(v.trip, line, data)) continue;
    const placed = placeOnLine(v.position.latitude, v.position.longitude, line, data);
    if (!placed || placed.offLine > MAX_OFF_LINE) continue;
    const segment = placed.segment;
    // Only a bearing the feed actually sent: Sydney Trains' positions don't have one.
    const direction =
      data.trips[tripId]?.dir ??
      (Object.hasOwn(v.position, "bearing")
        ? directionFromBearing(v.position.bearing!, segmentBearing(segment, line, data))
        : null);
    const id = v.vehicle?.id || entity.id;
    // Translink's vehicle ids aren't car numbers, and its feed doesn't say which trains they are.
    const { type, cars, carNumbers } =
      line.mode === "tram"
        ? melbourneTramType(id)
        : line.city === "sydney"
        ? sydneyTrainType(entity, line)
        : line.city === "brisbane"
          ? { type: null, cars: 0, carNumbers: null }
          : { ...trainType(id), carNumbers: id.split("-") };
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
      carNumbers,
      offLine: placed.offLine,
      known: tripId in data.trips,
    });
  }
  return { feedTimestamp: toNum(feed.header.timestamp), vehicles: [...byId.values()] };
}
