/**
 * Transport for NSW's extensions to GTFS-Realtime (tfnsw-gtfs-realtime.proto), which the standard bindings
 * skip over: each Sydney Trains vehicle's model (A for a Waratah, T for a Tangara, ...) and one entry per car.
 */
import protobuf from "protobufjs/minimal.js";
import type GtfsRealtimeBindings from "gtfs-realtime-bindings";

type Entity = GtfsRealtimeBindings.transit_realtime.IFeedEntity;

/** The extension's field number, on both VehicleDescriptor and VehiclePosition. */
const EXTENSION = 1007;

export interface Consist {
  /** Vehicle model letter, e.g. "A". */
  model: string | null;
  cars: number;
}

const consists = new WeakMap<Entity, Consist>();

/** The model and car count the feed gave a vehicle position entity, if it gave them. */
export const consistOf = (entity: Entity) => consists.get(entity) ?? null;

type Field = [field: number, value: Uint8Array | null];

/** A message's fields in order; length-delimited ones with their bytes, others skipped. */
function fields(bytes: Uint8Array): Field[] {
  const r = protobuf.Reader.create(bytes);
  const out: Field[] = [];
  while (r.pos < r.len) {
    const tag = r.uint32();
    if ((tag & 7) === 2) out.push([tag >>> 3, r.bytes()]);
    else {
      r.skipType(tag & 7);
      out.push([tag >>> 3, null]);
    }
  }
  return out;
}

/** Reads the extensions from a feed's bytes, for `feed`, decoded from the same bytes. Feeds without them are left alone. */
export function readConsists(bytes: Uint8Array, feed: GtfsRealtimeBindings.transit_realtime.FeedMessage) {
  if (!feed.entity.some((e) => e.vehicle)) return;
  try {
    const entities = fields(bytes).filter(([f]) => f === 2);
    entities.forEach(([, entityBytes], i) => {
      const entity = feed.entity[i];
      const vehicle = fields(entityBytes!).find(([f]) => f === 4)?.[1];
      if (!entity || !vehicle) return;
      const position = fields(vehicle);
      const cars = position.filter(([f]) => f === EXTENSION).length;
      const descriptor = position.find(([f]) => f === 8)?.[1];
      const ext = descriptor && fields(descriptor).find(([f]) => f === EXTENSION)?.[1];
      const model = ext && fields(ext).find(([f]) => f === 3)?.[1];
      if (cars || model) consists.set(entity, { model: model ? new TextDecoder().decode(model) : null, cars });
    });
  } catch {
    // Not what we expected: go without.
  }
}
